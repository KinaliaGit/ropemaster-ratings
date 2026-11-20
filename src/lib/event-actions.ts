"use server";
import { missingForPublish } from "@/lib/event-publish";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { closesAfterEvent, DEFAULT_TIMEZONE, isValidTimezone, zonedLocalToIso } from "@/lib/event-time";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Rating máximo para inscribirse (opcional). Vacío = sin límite (null). Debe ser un número de 0 a 10; se guarda con un decimal.
// Devuelve "invalid" si viene algo que no es un número en esa escala.
function ratingLimit(v: FormDataEntryValue | null): number | null | "invalid" {
  const raw = typeof v === "string" ? v.trim().replace(",", ".") : "";
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10) return "invalid";
  return Math.round(n * 10) / 10;
}

// Tipo de sorteo (KIN-648): hoy solo round_robin y lazada_sorteada. En Lazada Sorteada, los tiros por paquete (entero de 1 a 999) son obligatorios
// y el tope por equipo (0 a 20, un decimal) es opcional. Devuelve "invalid" si algo no cumple. La base lo vuelve a comprobar y no deja cambiar
// el tipo ni los tiros con inscritos o resultados.
type DrawFields = { drawType: "round_robin" | "lazada_sorteada"; shots: number | null; teamLimit: number | null; rounds: number | null };
function drawFields(formData: FormData): DrawFields | "invalid" | "invalidShots" | "invalidTeamLimit" | "invalidRounds" {
  const drawType = formData.get("drawType") === "lazada_sorteada" ? "lazada_sorteada" : formData.get("drawType") === "round_robin" ? "round_robin" : null;
  if (!drawType) return "invalid";
  const rawTeam = typeof formData.get("maxTeamRating") === "string" ? String(formData.get("maxTeamRating")).trim().replace(",", ".") : "";
  let teamLimit: number | null = null;
  if (rawTeam !== "") {
    const n = Number(rawTeam);
    if (!Number.isFinite(n) || n < 0 || n > 20) return "invalidTeamLimit";
    teamLimit = Math.round(n * 10) / 10;
  }
  // Rondas (KIN-655): opcional; entero de 1 a 10. Vacío = sin definir (la app usa su valor por defecto).
  const rawRounds = typeof formData.get("rounds") === "string" ? String(formData.get("rounds")).trim() : "";
  let rounds: number | null = null;
  if (rawRounds !== "") {
    const n = Number(rawRounds);
    if (!Number.isInteger(n) || n < 1 || n > 10) return "invalidRounds";
    rounds = n;
  }
  if (drawType === "round_robin") return { drawType, shots: null, teamLimit, rounds };
  const shots = Number(typeof formData.get("shotsPerPackage") === "string" ? String(formData.get("shotsPerPackage")).trim() : "");
  if (!Number.isInteger(shots) || shots < 1 || shots > 999) return "invalidShots";
  return { drawType, shots, teamLimit, rounds };
}

type Close = { ok: true; timezone: string; closesAt: string | null; opensAt: string | null } | { ok: false; error: "closeInvalid" | "closeAfterEvent" | "opensInvalid" | "opensAfterEvent" | "opensAfterClose" };

// Cierre de inscripciones (KIN-626): fecha y hora LOCALES del evento + su zona horaria. Vacío = sin fecha límite (abiertas hasta que el organizador cierre).
// No puede caer después del día del evento (el evento solo tiene fecha, así que se permite el mismo día). La base lo vuelve a comprobar.
function parseClose(formData: FormData, eventDate: string): Close {
  const tzRaw = text(formData.get("timezone"), 60) || DEFAULT_TIMEZONE;
  if (!isValidTimezone(tzRaw)) return { ok: false, error: "closeInvalid" };
  const local = text(formData.get("closesAt"), 16);
  let closesAt: string | null = null;
  if (local) {
    closesAt = zonedLocalToIso(local, tzRaw);
    if (!closesAt) return { ok: false, error: "closeInvalid" };
    if (closesAfterEvent(closesAt, eventDate, tzRaw)) return { ok: false, error: "closeAfterEvent" };
  }
  // Apertura de inscripciones (KIN-625): vacía = desde que el evento se publica; con fecha y hora, antes de ella nadie se inscribe solo.
  // Debe ser anterior al cierre y no puede caer después del día del evento.
  const opensLocal = text(formData.get("opensAt"), 16);
  let opensAt: string | null = null;
  if (opensLocal) {
    opensAt = zonedLocalToIso(opensLocal, tzRaw);
    if (!opensAt) return { ok: false, error: "opensInvalid" };
    if (closesAfterEvent(opensAt, eventDate, tzRaw)) return { ok: false, error: "opensAfterEvent" };
    if (closesAt && Date.parse(opensAt) >= Date.parse(closesAt)) return { ok: false, error: "opensAfterClose" };
  }
  return { ok: true, timezone: tzRaw, closesAt, opensAt };
}

// Instrucciones de pago (transferencia/efectivo): solo las ven el organizador y quienes se inscriben. Vacío = se borran.
async function savePaymentInfo(supabase: Awaited<ReturnType<typeof createServerSupabase>>, eventId: string, raw: FormDataEntryValue | null) {
  const instructions = text(raw, 1000);
  if (!instructions) await supabase.from("event_payment_info").delete().eq("event_id", eventId);
  else await supabase.from("event_payment_info").upsert({ event_id: eventId, instructions, updated_at: new Date().toISOString() });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Edita un evento propio (datos, modalidades y categorías). No cambia el estado ni el enlace. Reglas:
//  - el cupo no puede quedar por debajo de los inscritos;
//  - una categoría con inscritos no se puede quitar (sí se puede renombrar o cambiar su costo; lo ya inscrito conserva el precio con el que se apartó);
//  - un evento finalizado ya no se edita.
export async function updateEvent(formData: FormData) {
  const l = lang(formData.get("lang"));
  const eventSlug = text(formData.get("slug"), 80);
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  if (!session.verified) redirect(`/${l}/organizador`);
  const back = (error: string) => redirect(`/${l}/organizador/eventos/${eventSlug}/editar?error=${error}`);

  const supabase = await createServerSupabase();
  const { data: ev } = await supabase.from("events").select("id, status").eq("slug", eventSlug).eq("organizer_id", session.id).maybeSingle();
  if (!ev || ev.status === "finalizado") redirect(`/${l}/organizador`);

  const name = text(formData.get("name"), 120);
  const date = text(formData.get("date"), 10);
  const city = text(formData.get("city"), 80);
  const venue = text(formData.get("venue"), 120);
  const capacity = Math.floor(Number(formData.get("capacity")));
  const ids = formData.getAll("catId").map(String);
  const names = formData.getAll("catName").map((v) => text(v, 60));
  const fees = formData.getAll("catFee").map((v) => Math.max(0, Math.floor(Number(v)) || 0));
  const rows = names.map((n, i) => ({ id: UUID.test(ids[i] ?? "") ? ids[i] : null, name: n, fee: fees[i] ?? 0 })).filter((c) => c.name);
  const disciplines = formData.getAll("discipline").map(String).filter((d) => ACTIVE_DISCIPLINES.some((a) => a.id === d));
  const limit = ratingLimit(formData.get("maxRoperRating"));
  if (limit === "invalid") return back("ratingLimit");
  const draw = drawFields(formData);
  if (typeof draw === "string") return back(draw === "invalid" ? "drawType" : draw);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !city || !venue || !(capacity > 0) || rows.length === 0 || disciplines.length === 0) return back("1");
  const close = parseClose(formData, date);
  if (!close.ok) return back(close.error);

  const [{ count: enrolled }, { data: current }, { data: used }] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
    supabase.from("event_categories").select("id").eq("event_id", ev.id),
    supabase.from("registrations").select("category_id").eq("event_id", ev.id),
  ]);
  if (capacity < (enrolled ?? 0)) return back("capacity");
  const keep = new Set(rows.map((r) => r.id).filter(Boolean));
  const usedIds = new Set((used ?? []).map((r) => r.category_id));
  const toDelete = (current ?? []).map((c) => c.id).filter((id) => !keep.has(id));
  if (toDelete.some((id) => usedIds.has(id))) return back("catInUse");
  const owned = new Set((current ?? []).map((c) => c.id));

  const { error } = await supabase.from("events").update({ name, event_date: date, city, venue, capacity, disciplines, max_roper_rating: limit, draw_type: draw.drawType, lazada_shots_per_package: draw.shots, max_team_rating: draw.teamLimit, rounds: draw.rounds, description: text(formData.get("description"), 1000), timezone: close.timezone, registration_opens_at: close.opensAt, registration_closes_at: close.closesAt }).eq("id", ev.id);
  // Un evento de una serie debe seguir dentro de las fechas de su serie (la base lo exige).
  if (error) return back(error.message.includes("draw_type_locked") ? "drawLocked" : error.message.includes("rounds_locked") ? "roundsLocked" : error.message.includes("outside_series") ? "outsideSeries" : error.message.includes("open_after") ? "opensAfterClose" : "1");
  for (const r of rows) {
    if (r.id && owned.has(r.id)) await supabase.from("event_categories").update({ name: r.name, fee_cents: r.fee * 100 }).eq("id", r.id);
    else await supabase.from("event_categories").insert({ event_id: ev.id, name: r.name, fee_cents: r.fee * 100 });
  }
  if (toDelete.length) await supabase.from("event_categories").delete().in("id", toDelete);
  await savePaymentInfo(supabase, ev.id, formData.get("paymentInfo"));

  updateTag("events");
  updateTag("registrations");
  redirect(`/${l}/organizador/eventos/${eventSlug}?editado=1`);
}

// Publica un borrador o lo regresa a borrador. La base solo deja cambiar eventos propios.
export async function setEventStatus(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await getSession();
  const eventSlug = text(formData.get("id"), 80);
  if (session?.role !== "organizador" || !eventSlug) redirect(`/${l}/organizador`);

  const supabase = await createServerSupabase();
  const { data: current } = await supabase.from("events").select("id, status, city, venue, capacity").eq("slug", eventSlug).eq("organizer_id", session.id).maybeSingle();
  if (!current || current.status === "finalizado") redirect(`/${l}/organizador`);

  const next = current.status === "borrador" ? "publicado" : "borrador";
  if (next === "publicado") {
    // Un borrador subido desde la app llega sin ciudad ni cupo: no se publica hasta completarlo (KIN-659).
    const { count } = await supabase.from("event_categories").select("id", { count: "exact", head: true }).eq("event_id", current.id);
    const missing = missingForPublish({ city: current.city, venue: current.venue, capacity: current.capacity, categories: count ?? 0 });
    if (missing.length) redirect(`/${l}/organizador/eventos/${eventSlug}?faltan=${missing.join(",")}`);
  }
  await supabase.from("events").update({ status: next }).eq("id", current.id);
  updateTag("events");
  redirect(`/${l}/organizador/eventos/${eventSlug}${next === "publicado" ? "?nuevo=publicado" : ""}`);
}

// Cierra las inscripciones antes de tiempo o las reabre (KIN-626). Reabrir después de la fecha límite borra esa fecha (queda abierto hasta
// que el organizador lo cierre o ponga otra fecha al editar). La base solo deja cambiar eventos propios.
export async function setRegistrationOpen(formData: FormData) {
  const l = lang(formData.get("lang"));
  const eventSlug = text(formData.get("id"), 80);
  const session = await getSession();
  if (session?.role !== "organizador" || !session.verified || !eventSlug) redirect(`/${l}/organizador`);

  const supabase = await createServerSupabase();
  const { data: ev } = await supabase.from("events").select("id, status, registration_closes_at").eq("slug", eventSlug).eq("organizer_id", session.id).maybeSingle();
  if (!ev || ev.status === "finalizado") redirect(`/${l}/organizador`);

  const reopen = formData.get("open") === "true";
  const deadlinePassed = !!ev.registration_closes_at && Date.parse(ev.registration_closes_at) <= Date.now();
  const patch = reopen ? { registration_closed: false, ...(deadlinePassed ? { registration_closes_at: null } : {}) } : { registration_closed: true };
  await supabase.from("events").update(patch).eq("id", ev.id);
  updateTag("events");
  redirect(`/${l}/organizador/eventos/${eventSlug}`);
}
