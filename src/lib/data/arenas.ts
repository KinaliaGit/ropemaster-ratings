import { createServerSupabase } from "@/lib/supabase/server";

// Catálogo de arenas del organizador (KIN-751). Se lee con su sesión: las reglas de la base solo devuelven las suyas.

export type ArenaItem = { id: string; name: string; city: string; notes: string; events: number; series: number };

type Row = { id: string; name: string; city: string; notes: string; events: { count: number }[] | null; event_series_template: { count: number }[] | null };

export async function listArenas(): Promise<ArenaItem[]> {
  const { data, error } = await (await createServerSupabase()).from("arenas")
    .select("id, name, city, notes, events(count), event_series_template(count)").order("name");
  if (error) throw new Error(`No se pudieron leer tus arenas: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, name: r.name, city: r.city, notes: r.notes, events: r.events?.[0]?.count ?? 0, series: r.event_series_template?.[0]?.count ?? 0 }));
}

export type ArenaEvent = { slug: string; name: string; date: string | null; status: string; seriesName: string | null };
export type ArenaSeries = { slug: string; name: string; startDate: string; endDate: string };
export type ArenaDetail = { id: string; name: string; city: string; notes: string; events: ArenaEvent[]; series: ArenaSeries[] };

type EvRow = { slug: string | null; name: string; event_date: string | null; status: string; event_series: { slug: string; name: string } | null };
type SerRow = { slug: string; name: string; start_date: string; end_date: string };

// Una arena con su historial: todos sus eventos (el más reciente primero) y las series que la usan (por su plantilla o por sus eventos).
export async function getArena(id: string): Promise<ArenaDetail | null> {
  const supabase = await createServerSupabase();
  const { data: a, error } = await supabase.from("arenas").select("id, name, city, notes").eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la arena: ${error.message}`);
  if (!a) return null;
  const [{ data: evs, error: e1 }, { data: tpls, error: e2 }] = await Promise.all([
    supabase.from("events").select("slug, name, event_date, status, event_series(slug, name)").eq("arena_id", id).order("event_date", { ascending: false, nullsFirst: false }),
    supabase.from("event_series_template").select("event_series(slug, name, start_date, end_date)").eq("arena_id", id),
  ]);
  if (e1 || e2) throw new Error(`No se pudo leer el historial de la arena: ${(e1 ?? e2)!.message}`);
  const events = ((evs ?? []) as unknown as EvRow[]).filter((e) => e.slug).map((e) => ({ slug: e.slug!, name: e.name, date: e.event_date, status: e.status, seriesName: e.event_series?.name ?? null }));
  const bySlug = new Map<string, ArenaSeries>();
  for (const t of (tpls ?? []) as unknown as { event_series: SerRow | null }[]) if (t.event_series) bySlug.set(t.event_series.slug, { slug: t.event_series.slug, name: t.event_series.name, startDate: t.event_series.start_date, endDate: t.event_series.end_date });
  const evSeriesSlugs = [...new Set(((evs ?? []) as unknown as EvRow[]).map((e) => e.event_series?.slug).filter((s): s is string => !!s && !bySlug.has(s)))];
  if (evSeriesSlugs.length) {
    const { data: more } = await supabase.from("event_series").select("slug, name, start_date, end_date").in("slug", evSeriesSlugs);
    for (const s of (more ?? []) as SerRow[]) bySlug.set(s.slug, { slug: s.slug, name: s.name, startDate: s.start_date, endDate: s.end_date });
  }
  return { id: a.id, name: a.name, city: a.city, notes: a.notes, events, series: [...bySlug.values()].sort((x, y) => y.startDate.localeCompare(x.startDate)) };
}
