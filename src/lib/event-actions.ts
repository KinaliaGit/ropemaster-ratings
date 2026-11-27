"use server";
import { after } from "next/server";
import { missingForPublish } from "@/lib/event-publish";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { slugify } from "@/lib/slug";
import { resolveArena } from "@/lib/arena-resolve";
import { emailParticipant } from "@/lib/notify";
import { closesAfterEvent, DEFAULT_TIMEZONE, endOfDayIso, parseEventTime, startOfDayIso } from "@/lib/event-time";
import { visibilityForCreate } from "@/lib/event-visibility";
import { serializeFormValues, type EventFormState } from "@/lib/event-form-state";
import { parseCapacity } from "@/lib/event-capacity";
import { teamLimitApplies } from "@/lib/rating-limits";

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
  // KIN-776: el tope por equipo solo existe en Lazada Sorteada. En otro tipo se ignora aunque llegue un valor (nunca limita ni se guarda).
  const rawTeam = teamLimitApplies(drawType) && typeof formData.get("maxTeamRating") === "string" ? String(formData.get("maxTeamRating")).trim().replace(",", ".") : "";
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

type CloseError = "closeInvalid" | "closeAfterEvent" | "opensInvalid" | "opensAfterEvent" | "opensAfterClose";
type Close = { ok: true; closesAt: string | null; opensAt: string | null } | { ok: false; error: CloseError };

// Apertura y cierre de inscripciones (KIN-625, KIN-626, KIN-778). La persona elige DÍAS, sin hora ni zona: la apertura es el inicio de ese día y el cierre el final de ese día,
// en la zona horaria del evento (un dato interno que el formulario ya no pide: en un evento nuevo la de siempre y en uno guardado la suya).
//   closeMode: none (sin fecha: abiertas hasta que el organizador cierre) | event (al terminar el día del evento) | day (al terminar el día `closesOn`).
//   opensMode: publish (desde que se publica el evento) | day (desde el inicio del día `opensOn`).
// El cierre y la apertura no pueden caer después del día del evento, y la apertura va antes del cierre. La base lo vuelve a comprobar.
function parseClose(formData: FormData, eventDate: string, tz: string): Close {
  const closeMode = text(formData.get("closeMode"), 10);
  let closesAt: string | null = null;
  if (closeMode === "event") closesAt = endOfDayIso(eventDate, tz);
  else if (closeMode === "day") {
    closesAt = endOfDayIso(text(formData.get("closesOn"), 10), tz);
    if (!closesAt) return { ok: false, error: "closeInvalid" };
    if (closesAfterEvent(closesAt, eventDate, tz)) return { ok: false, error: "closeAfterEvent" };
  } else if (closeMode && closeMode !== "none") return { ok: false, error: "closeInvalid" };

  const opensMode = text(formData.get("opensMode"), 10);
  let opensAt: string | null = null;
  if (opensMode === "day") {
    opensAt = startOfDayIso(text(formData.get("opensOn"), 10), tz);
    if (!opensAt) return { ok: false, error: "opensInvalid" };
    if (closesAfterEvent(opensAt, eventDate, tz)) return { ok: false, error: "opensAfterEvent" };
    if (closesAt && Date.parse(opensAt) >= Date.parse(closesAt)) return { ok: false, error: "opensAfterClose" };
  } else if (opensMode && opensMode !== "publish") return { ok: false, error: "opensInvalid" };
  return { ok: true, closesAt, opensAt };
}

// Crea un evento individual (KIN-750): uno que no pertenece a ninguna serie (`series_id` null). Pide lo mismo que cada evento de una serie
// (sorteo, rondas, cupo, categorías, apertura y cierre). Nace como borrador o publicado y lleva al organizador a su pantalla, donde está el enlace
// para compartir. Las reglas de la base garantizan que solo un organizador activo cree eventos a su nombre.
// KIN-774: si algo no cumple NO se redirige (se perdía lo escrito): se devuelve el error con los valores que mandó la persona y el formulario los vuelve a mostrar.
export async function createEvent(prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const l = lang(formData.get("lang"));
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  if (!session.verified) redirect(`/${l}/organizador`); // sin licencia vigente ni aprobación no se crean eventos (la base también lo impone)
  const back = (error: string): EventFormState => ({ attempt: prev.attempt + 1, error, values: serializeFormValues(formData) });

  const name = text(formData.get("name"), 120);
  const date = text(formData.get("date"), 10);
  const city = text(formData.get("city"), 80);
  const venue = text(formData.get("venue"), 120);
  const capacity = parseCapacity(formData.get("capacity")); // opcional: vacío = sin límite (KIN-774)
  const names = formData.getAll("catName").map((v) => text(v, 60));
  const fees = formData.getAll("catFee").map((v) => Math.max(0, Math.floor(Number(v)) || 0));
  const categories = names.map((n, i) => ({ name: n, fee: fees[i] ?? 0 })).filter((c) => c.name);
  const disciplines = formData.getAll("discipline").map(String).filter((d) => ACTIVE_DISCIPLINES.some((a) => a.id === d));

  const limit = ratingLimit(formData.get("maxRoperRating"));
  if (limit === "invalid") return back("ratingLimit");
  if (capacity === "invalid") return back("capacityInvalid");
  const draw = drawFields(formData);
  if (typeof draw === "string") return back(draw === "invalid" ? "drawType" : draw);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !city || !venue || categories.length === 0 || categories.length > 20 || disciplines.length === 0) return back("1");
  const close = parseClose(formData, date, DEFAULT_TIMEZONE);
  if (!close.ok) return back(close.error);
  const eventTime = parseEventTime(formData.get("eventTime"));
  if (eventTime === "invalid") return back("eventTimeInvalid");

  const status = formData.get("intent") === "publish" ? "publicado" : "borrador";
  // KIN-769: quién puede ver el evento se elige al PUBLICAR (ventana de «Publicar»); un borrador no lo decide. Se manda a la base solo si es privado: lo público es el valor por
  // defecto, así que crear eventos públicos funciona igual aunque la migración 0058 (permiso de escribir la visibilidad) aún no esté aplicada.
  const visibility = visibilityForCreate(formData.get("intent"), formData.get("visibility"));
  const supabase = await createServerSupabase();
  const id = crypto.randomUUID();
  const eventSlug = slugify(name);
  const arena = await resolveArena(supabase, session.id, formData);
  if (!arena) return back("arena");

  const { error } = await supabase.from("events").insert({
    ...(visibility === "privado" ? { visibility } : {}),
    id, slug: eventSlug, name, event_date: date, city: arena.city || city, venue: arena.name, arena_id: arena.id, capacity, disciplines, status, max_roper_rating: limit,
    draw_type: draw.drawType, lazada_shots_per_package: draw.shots, max_team_rating: draw.teamLimit, rounds: draw.rounds,
    description: text(formData.get("description"), 1000), organizer_id: session.id, organizer_name: session.name,
    event_time: eventTime, timezone: DEFAULT_TIMEZONE, registration_opens_at: close.opensAt, registration_closes_at: close.closesAt,
  });
  if (error) {
    console.error("createEvent: no se pudo crear el evento", error.code, error.message);
    return back("1");
  }

  const { error: catError } = await supabase.from("event_categories").insert(categories.map((c) => ({ event_id: id, name: c.name, fee_cents: c.fee * 100 })));
  if (catError) {
    console.error("createEvent: no se pudieron crear las categorías", catError.code, catError.message);
    await supabase.from("events").delete().eq("id", id); // no dejar un evento sin categorías
    return back("1");
  }

  await savePaymentInfo(supabase, id, formData.get("paymentInfo"));
  updateTag("events");
  redirect(`/${l}/organizador/eventos/${eventSlug}?nuevo=${status}${visibility === "privado" ? "&privado=1" : ""}`);
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
export async function updateEvent(prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const l = lang(formData.get("lang"));
  const eventSlug = text(formData.get("slug"), 80);
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  if (!session.verified) redirect(`/${l}/organizador`);
  const back = (error: string): EventFormState => ({ attempt: prev.attempt + 1, error, values: serializeFormValues(formData) });

  const supabase = await createServerSupabase();
  const { data: ev } = await supabase.from("events").select("id, status, timezone").eq("slug", eventSlug).eq("organizer_id", session.id).maybeSingle();
  if (!ev || ev.status === "finalizado") redirect(`/${l}/organizador`);

  const name = text(formData.get("name"), 120);
  const date = text(formData.get("date"), 10);
  const city = text(formData.get("city"), 80);
  const venue = text(formData.get("venue"), 120);
  const capacity = parseCapacity(formData.get("capacity"));
  const ids = formData.getAll("catId").map(String);
  const names = formData.getAll("catName").map((v) => text(v, 60));
  const fees = formData.getAll("catFee").map((v) => Math.max(0, Math.floor(Number(v)) || 0));
  const rows = names.map((n, i) => ({ id: UUID.test(ids[i] ?? "") ? ids[i] : null, name: n, fee: fees[i] ?? 0 })).filter((c) => c.name);
  const disciplines = formData.getAll("discipline").map(String).filter((d) => ACTIVE_DISCIPLINES.some((a) => a.id === d));
  const limit = ratingLimit(formData.get("maxRoperRating"));
  if (limit === "invalid") return back("ratingLimit");
  if (capacity === "invalid") return back("capacityInvalid");
  const draw = drawFields(formData);
  if (typeof draw === "string") return back(draw === "invalid" ? "drawType" : draw);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !city || !venue || rows.length === 0 || disciplines.length === 0) return back("1");
  const close = parseClose(formData, date, ev.timezone); // la zona del evento ya no se edita: se conserva la que tiene
  if (!close.ok) return back(close.error);
  const eventTime = parseEventTime(formData.get("eventTime"));
  if (eventTime === "invalid") return back("eventTimeInvalid");

  const [{ count: enrolled }, { data: current }, { data: used }] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
    supabase.from("event_categories").select("id").eq("event_id", ev.id),
    supabase.from("registrations").select("category_id").eq("event_id", ev.id),
  ]);
  if (capacity !== null && capacity < (enrolled ?? 0)) return back("capacity");
  const keep = new Set(rows.map((r) => r.id).filter(Boolean));
  const usedIds = new Set((used ?? []).map((r) => r.category_id));
  const toDelete = (current ?? []).map((c) => c.id).filter((id) => !keep.has(id));
  if (toDelete.some((id) => usedIds.has(id))) return back("catInUse");
  const owned = new Set((current ?? []).map((c) => c.id));

  const arena = await resolveArena(supabase, session.id, formData);
  if (!arena) return back("arena");
  const { error } = await supabase.from("events").update({ name, event_date: date, city: arena.city || city, venue: arena.name, arena_id: arena.id, capacity, disciplines, max_roper_rating: limit, draw_type: draw.drawType, lazada_shots_per_package: draw.shots, max_team_rating: draw.teamLimit, rounds: draw.rounds, description: text(formData.get("description"), 1000), event_time: eventTime, registration_opens_at: close.opensAt, registration_closes_at: close.closesAt }).eq("id", ev.id);
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
    const missing = missingForPublish({ city: current.city, venue: current.venue, categories: count ?? 0 });
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

// ---- Borrar un evento (KIN-660). Solo el organizador dueño; la base valida todo (dueño, sin resultados, sin finalizar, motivo con inscritos) y deja
// el aviso dentro de la web para cada inscrito. Aquí se exige la palabra de confirmación (también en el servidor, no solo en el diálogo) y, ya borrado,
// se manda el correo a cada inscrito sin que un fallo de correo deshaga nada.
const DELETE_ERRORS = ["invalid_reason", "has_results", "closed", "not_found"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteEvent(formData: FormData) {
  const l = lang(formData.get("lang"));
  const slug = text(formData.get("slug"), 120);
  const id = text(formData.get("id"), 40);
  const s = await getSession();
  if (s?.role !== "organizador" || !s.verified) redirect(`/${l}/organizador`);
  const back = (code: string) => redirect(`/${l}/organizador/eventos/${encodeURIComponent(slug)}?borrarError=${code}`);
  if (!UUID_RE.test(id)) return back("not_found");
  if (!["borrar", "delete"].includes(text(formData.get("confirmWord"), 20).toLowerCase())) return back("confirm");
  const supabase = await createServerSupabase();
  // Datos para el correo: se leen ANTES, porque después el evento ya no existe.
  const { data: ev } = await supabase.from("events").select("name, event_date, city, venue, organizer_name").eq("id", id).eq("organizer_id", s.id).maybeSingle();
  const { data: people, error } = await supabase.rpc("delete_event", { p_event: id, p_reason: text(formData.get("reason"), 500) });
  if (error) return back(DELETE_ERRORS.find((k) => error.message.includes(k)) ?? "failed");
  updateTag("events");
  updateTag("registrations");
  if (ev && Array.isArray(people)) {
    const reason = text(formData.get("reason"), 500);
    after(async () => {
      for (const p of people as { roper_id: string; paid: boolean }[]) {
        await emailParticipant({
          kind: "event_deleted", roperId: p.roper_id, eventName: ev.name, eventDate: ev.event_date, place: [ev.venue, ev.city].filter(Boolean).join(", "),
          organizerId: s.id, organizerName: ev.organizer_name ?? "", reason, paid: p.paid,
        });
      }
    });
  }
  redirect(`/${l}/organizador?borrado=1`);
}
