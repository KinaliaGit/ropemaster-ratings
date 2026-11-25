"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { DEFAULT_TIMEZONE, isValidTimezone, zonedLocalToIso } from "@/lib/event-time";
import { slugify } from "@/lib/slug";
import { missingForPublish } from "@/lib/event-publish";
import { resolveArena } from "@/lib/arena-resolve";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 30; // el mismo tope que impone la base

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
const KNOWN = ["outside_series", "open_after_event", "open_after_close", "series_full", "template_incomplete", "events_outside_range", "has_registrations", "has_results", "closed", "not_in_series", "not_found"];
const codeOf = (message: string) => KNOWN.find((k) => message.includes(k)) ?? "failed";

// Datos de la serie y de su plantilla (lo que se copia a cada evento nuevo).
function parseSeries(formData: FormData) {
  const name = text(formData.get("name"), 120);
  const startDate = text(formData.get("startDate"), 10);
  const endDate = text(formData.get("endDate"), 10);
  const tzRaw = text(formData.get("timezone"), 60) || DEFAULT_TIMEZONE;
  const city = text(formData.get("city"), 80);
  const venue = text(formData.get("venue"), 120);
  const capacity = Math.floor(Number(formData.get("capacity")));
  const names = formData.getAll("catName").map((v) => text(v, 60));
  const fees = formData.getAll("catFee").map((v) => Math.max(0, Math.floor(Number(v)) || 0));
  const categories = names.map((n, i) => ({ name: n, fee_cents: (fees[i] ?? 0) * 100 })).filter((c) => c.name);
  const disciplines = formData.getAll("discipline").map(String).filter((d) => ACTIVE_DISCIPLINES.some((a) => a.id === d));
  let error: string | null = null;
  if (name.length < 2 || !DATE.test(startDate) || !DATE.test(endDate) || !city || !venue || !(capacity > 0) || categories.length === 0 || categories.length > 20 || disciplines.length === 0) error = "1";
  else if (endDate < startDate) error = "range";
  else if (!isValidTimezone(tzRaw)) error = "1";
  return {
    error, name, startDate, endDate, timezone: tzRaw, description: text(formData.get("description"), 1000),
    template: { city, venue, capacity, disciplines, categories, payment_info: text(formData.get("paymentInfo"), 1000) },
  };
}

async function organizer(l: string) {
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  if (!session.verified) redirect(`/${l}/organizador`); // sin licencia vigente ni aprobación no se crean series (la base también lo impone)
  return session;
}

// Crea la serie (con su plantilla) y lleva al organizador a su pantalla, donde agrega los eventos.
export async function createSeries(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await organizer(l);
  const p = parseSeries(formData);
  if (p.error) redirect(`/${l}/organizador/series/nueva?error=${p.error}`);

  const supabase = await createServerSupabase();
  const id = crypto.randomUUID();
  const seriesSlug = slugify(p.name, "serie");
  const arena = await resolveArena(supabase, session.id, formData);
  if (!arena) redirect(`/${l}/organizador/series/nueva?error=arena`);
  const { error } = await supabase.from("event_series").insert({
    id, slug: seriesSlug, organizer_id: session.id, organizer_name: session.name, name: p.name, description: p.description, start_date: p.startDate, end_date: p.endDate, timezone: p.timezone,
  });
  if (error) redirect(`/${l}/organizador/series/nueva?error=1`);
  const { error: tplError } = await supabase.from("event_series_template").insert({ series_id: id, ...p.template, city: arena.city || p.template.city, venue: arena.name, arena_id: arena.id });
  if (tplError) {
    await supabase.from("event_series").delete().eq("id", id); // no dejar una serie sin plantilla
    redirect(`/${l}/organizador/series/nueva?error=1`);
  }
  updateTag("events");
  redirect(`/${l}/organizador/series/${seriesSlug}?nueva=1`);
}

// Edita la serie y su plantilla. La plantilla solo aplica a los eventos que se creen después: los ya creados no cambian.
// No se puede acortar el rango dejando fuera a un evento (la base lo rechaza).
export async function updateSeries(formData: FormData) {
  const l = lang(formData.get("lang"));
  const seriesSlug = text(formData.get("slug"), 80);
  const session = await organizer(l);
  const back = (error: string) => redirect(`/${l}/organizador/series/${seriesSlug}/editar?error=${error}`);
  const p = parseSeries(formData);
  if (p.error) return back(p.error);

  const supabase = await createServerSupabase();
  const { data: s } = await supabase.from("event_series").select("id").eq("slug", seriesSlug).eq("organizer_id", session.id).maybeSingle();
  if (!s) redirect(`/${l}/organizador/series`);
  const { error } = await supabase.from("event_series").update({ name: p.name, description: p.description, start_date: p.startDate, end_date: p.endDate, timezone: p.timezone }).eq("id", s.id);
  if (error) return back(error.message.includes("events_outside_range") ? "outsideRange" : "1");
  const arena = await resolveArena(supabase, session.id, formData);
  if (!arena) return back("arena");
  const { error: tplError } = await supabase.from("event_series_template").upsert({ series_id: s.id, ...p.template, city: arena.city || p.template.city, venue: arena.name, arena_id: arena.id });
  if (tplError) return back("1");
  updateTag("events");
  redirect(`/${l}/organizador/series/${seriesSlug}?editada=1`);
}

// Borra la serie (KIN-660): solo cuando ya no tiene eventos (primero se borran los eventos, como en la app) y escribiendo la palabra de confirmación.
// La base valida el dueño y que no queden eventos.
export async function deleteSeries(formData: FormData) {
  const l = lang(formData.get("lang"));
  const seriesSlug = text(formData.get("slug"), 80);
  const session = await organizer(l);
  const back = (code: string) => redirect(`/${l}/organizador/series/${seriesSlug}?borrarError=${code}`);
  if (!["borrar", "delete"].includes(text(formData.get("confirmWord"), 20).toLowerCase())) return back("confirm");
  const supabase = await createServerSupabase();
  const found = await ownSeries(supabase, seriesSlug, session.id);
  if (!found) return back("not_found");
  const { error } = await supabase.rpc("delete_series", { p_series: found.id });
  if (error) return back(["has_events", "not_found"].find((k) => error.message.includes(k)) ?? "failed");
  updateTag("events");
  redirect(`/${l}/organizador/series?borrada=1`);
}

async function ownSeries(supabase: Supabase, seriesSlug: string, organizerId: string) {
  const { data } = await supabase.from("event_series").select("id, start_date, end_date, timezone, name").eq("slug", seriesSlug).eq("organizer_id", organizerId).maybeSingle();
  return data;
}

// Agrega eventos a la serie, uno o varios de golpe (todos o ninguno). Cada uno copia la plantilla de la serie; se elige cuándo abren sus
// inscripciones: vacío = desde que se publica el evento, o una fecha y hora (en la zona de la serie) en que se abren solas.
export async function addSeriesEvents(formData: FormData) {
  const l = lang(formData.get("lang"));
  const seriesSlug = text(formData.get("slug"), 80);
  const session = await organizer(l);
  const back = (error: string) => redirect(`/${l}/organizador/series/${seriesSlug}?error=${error}#agregar`);
  const supabase = await createServerSupabase();
  const s = await ownSeries(supabase, seriesSlug, session.id);
  if (!s) redirect(`/${l}/organizador/series`);

  const names = formData.getAll("evName").map((v) => text(v, 120));
  const dates = formData.getAll("evDate").map((v) => text(v, 10));
  const opens = formData.getAll("evOpens").map((v) => text(v, 16));
  const rows = names.map((name, i) => ({ name, date: dates[i] ?? "", opens: opens[i] ?? "" })).filter((r) => r.name || r.date);
  if (rows.length === 0 || rows.length > MAX_EVENTS) return back("noEvents");
  const items = [];
  for (const r of rows) {
    if (!r.name || !DATE.test(r.date)) return back("invalidRow");
    if (r.date < s.start_date || r.date > s.end_date) return back("outsideRange");
    let opensAt: string | null = null;
    if (r.opens) {
      opensAt = zonedLocalToIso(r.opens, s.timezone);
      if (!opensAt) return back("invalidRow");
    }
    items.push({ id: crypto.randomUUID(), slug: slugify(r.name), name: r.name, date: r.date, opens_at: opensAt });
  }
  const { error } = await supabase.rpc("add_series_events", { p_series: s.id, p_events: items, p_publish: formData.get("intent") === "publish" });
  if (error) return back(codeOf(error.message));
  updateTag("events");
  redirect(`/${l}/organizador/series/${seriesSlug}?agregados=${items.length}#eventos`);
}

// Borra un evento de la serie (solo sin inscritos ni resultados y sin finalizar; la base lo decide).
export async function deleteSeriesEvent(formData: FormData) {
  const l = lang(formData.get("lang"));
  const seriesSlug = text(formData.get("slug"), 80);
  const id = text(formData.get("id"), 40);
  await organizer(l);
  if (!UUID.test(id)) redirect(`/${l}/organizador/series/${seriesSlug}`);
  const { error } = await (await createServerSupabase()).rpc("delete_series_event", { p_event: id });
  if (!error) updateTag("events");
  redirect(`/${l}/organizador/series/${seriesSlug}?${error ? `error=del_${codeOf(error.message)}` : "borrado=1"}#eventos`);
}

// Publica de una vez todos los borradores de la serie.
export async function publishSeriesDrafts(formData: FormData) {
  const l = lang(formData.get("lang"));
  const seriesSlug = text(formData.get("slug"), 80);
  const session = await organizer(l);
  const supabase = await createServerSupabase();
  const s = await ownSeries(supabase, seriesSlug, session.id);
  if (!s) redirect(`/${l}/organizador/series`);
  // Solo se publican los borradores completos (KIN-659): los subidos desde la app llegan sin ciudad ni cupo y se completan a mano.
  const { data: drafts } = await supabase.from("events").select("id, city, venue, capacity, event_categories(id)").eq("series_id", s.id).eq("status", "borrador").eq("organizer_id", session.id);
  const ready = (drafts ?? []).filter((d) => missingForPublish({ city: d.city, venue: d.venue, capacity: d.capacity, categories: d.event_categories?.length ?? 0 }).length === 0);
  const incomplete = (drafts ?? []).length - ready.length;
  if (ready.length) await supabase.from("events").update({ status: "publicado" }).in("id", ready.map((d) => d.id)).eq("organizer_id", session.id);
  updateTag("events");
  redirect(`/${l}/organizador/series/${seriesSlug}?${ready.length ? "publicados=1" : "publicados=0"}${incomplete ? `&incompletos=${incomplete}` : ""}#eventos`);
}
