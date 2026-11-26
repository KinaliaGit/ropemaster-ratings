import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase } from "@/lib/supabase/server";
import type { EventItem } from "@/lib/types";
import { listOrganizerEvents, listPublicEvents } from "@/lib/data/events";

// Series de eventos (KIN-625). La serie y sus eventos se leen con las reglas de la base: la serie es pública si tiene algún evento visible.

export type SeriesItem = {
  id: string; uuid: string; organizerId: string; organizer: string; name: string; description: string; startDate: string; endDate: string; timezone: string;
};
export type SeriesTemplate = { arenaId: string | null; city: string; venue: string; capacity: number | null; disciplines: string[]; categories: { name: string; fee: number }[]; paymentInfo: string };

const COLUMNS = "id, slug, organizer_id, organizer_name, name, description, start_date, end_date, timezone";
type Row = { id: string; slug: string; organizer_id: string; organizer_name: string | null; name: string; description: string; start_date: string; end_date: string; timezone: string };
const toItem = (r: Row): SeriesItem => ({
  id: r.slug, uuid: r.id, organizerId: r.organizer_id, organizer: r.organizer_name ?? "", name: r.name, description: r.description, startDate: r.start_date, endDate: r.end_date, timezone: r.timezone,
});
const byDate = (a: EventItem, b: EventItem) => (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name);

// ---- Pública (en caché; se invalida con updateTag("events") al crear o cambiar series y eventos) ----

export async function getPublicSeries(slug: string): Promise<{ series: SeriesItem; events: EventItem[] } | null> {
  "use cache";
  cacheTag("events", "registrations");
  cacheLife("minutes");
  const { data, error } = await createPublicClient().from("event_series").select(COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`No se pudo leer la serie: ${error.message}`);
  if (!data) return null;
  const events = (await listPublicEvents()).filter((e) => e.series?.slug === slug).sort(byDate);
  if (events.length === 0) return null; // sin eventos visibles no hay página pública
  return { series: toItem(data as Row), events };
}

// ---- Del organizador (con su sesión; sin caché: ve también sus borradores) ----

/** `loaded`: los eventos del organizador si quien llama ya los está pidiendo, para no leerlos dos veces. */
export async function listOrganizerSeries(organizerId: string, loaded?: Promise<EventItem[]>): Promise<{ series: SeriesItem; events: EventItem[] }[]> {
  const supabase = await createServerSupabase();
  const [{ data, error }, events] = await Promise.all([
    supabase.from("event_series").select(COLUMNS).eq("organizer_id", organizerId).order("start_date", { ascending: false }),
    loaded ?? listOrganizerEvents(organizerId),
  ]);
  if (error) throw new Error(`No se pudieron leer tus series: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({ series: toItem(r), events: events.filter((e) => e.series?.slug === r.slug).sort(byDate) }));
}

export async function getOrganizerSeries(organizerId: string, slug: string): Promise<{ series: SeriesItem; template: SeriesTemplate; events: EventItem[] } | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("event_series").select(COLUMNS).eq("organizer_id", organizerId).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`No se pudo leer la serie: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  const [{ data: tpl }, events] = await Promise.all([
    supabase.from("event_series_template").select("arena_id, city, venue, capacity, disciplines, categories, payment_info").eq("series_id", row.id).maybeSingle(),
    listOrganizerEvents(organizerId),
  ]);
  const t = tpl as { arena_id: string | null; city: string; venue: string; capacity: number | null; disciplines: string[]; categories: { name: string; fee_cents: number }[]; payment_info: string } | null;
  return {
    series: toItem(row),
    template: { arenaId: t?.arena_id ?? null, city: t?.city ?? "", venue: t?.venue ?? "", capacity: t?.capacity ?? null, disciplines: t?.disciplines ?? [], categories: (t?.categories ?? []).map((c) => ({ name: c.name, fee: Math.round(c.fee_cents / 100) })), paymentInfo: t?.payment_info ?? "" },
    events: events.filter((e) => e.series?.slug === slug).sort(byDate),
  };
}
