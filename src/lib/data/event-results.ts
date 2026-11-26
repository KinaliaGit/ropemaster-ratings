import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase } from "@/lib/supabase/server";
import { EVENT_RESULTS_PAGE_SIZE, isUuid, toEventResultsPage, type EventResultsPage } from "@/lib/event-results";
import { toRounds, type Round } from "@/lib/results-history";
import { matchesName } from "@/lib/search";

// Lecturas PÚBLICAS de los resultados de un evento (KIN-608). Los resultados solo se ven si el evento es visible (migración 0029),
// así que los de un borrador no salen aunque se pidan por su id.

// Resultados de UNA modalidad del evento, UNA PÁGINA a la vez y ordenados por lugar. `after` es la última posición de la página anterior.
export async function getEventResults(eventUuid: string, discipline: string, after: number | null = null): Promise<EventResultsPage> {
  "use cache";
  cacheTag("events", "ropers");
  cacheLife("minutes");
  if (!isUuid(eventUuid)) return { rows: [], next: null, total: 0 };
  const { data, error } = await createPublicClient().rpc("public_event_results", {
    p_event: eventUuid, p_discipline: discipline, p_after: after, p_limit: EVENT_RESULTS_PAGE_SIZE + 1,
  });
  if (error) throw new Error(`No se pudieron leer los resultados: ${error.message}`);
  return toEventResultsPage((data ?? []) as Parameters<typeof toEventResultsPage>[0], EVENT_RESULTS_PAGE_SIZE);
}

// KIN-768: los resultados de quienes coinciden con un nombre, con su lugar real. Recorre las páginas ya en caché (la base no cambia) y se
// detiene en un tope para que un evento enorme no dispare consultas sin fin.
const SEARCH_MAX_PAGES = 100;
export async function searchEventResults(eventUuid: string, discipline: string, query: string): Promise<EventResultsPage> {
  const rows: EventResultsPage["rows"] = [];
  let after: number | null = null;
  for (let i = 0; i < SEARCH_MAX_PAGES; i++) {
    const page: EventResultsPage = await getEventResults(eventUuid, discipline, after);
    rows.push(...page.rows.filter((r) => matchesName(r.name, query)));
    after = page.next;
    if (after === null) break;
  }
  return { rows, next: null, total: rows.length };
}

// Rondas de UN resultado de ese evento (null si no existe, es de otro evento o el evento no es público).
export async function getEventResultRounds(eventUuid: string, resultId: string): Promise<Round[] | null> {
  "use cache";
  cacheTag("events", "ropers");
  cacheLife("minutes");
  if (!isUuid(eventUuid) || !isUuid(resultId)) return null;
  const { data, error } = await createPublicClient().from("event_results").select("rounds").eq("id", resultId).eq("event_id", eventUuid).maybeSingle();
  if (error) throw new Error(`No se pudieron leer las rondas: ${error.message}`);
  return data ? toRounds(data.rounds) : null;
}

// KIN-628: lo que solo necesita el organizador del evento: cuántos resultados llegaron de la app, cuándo fue el último envío y si ya cerró el evento.
// Sin caché (es de su sesión). La base solo deja leer resultados de eventos visibles y el evento ya se leyó como suyo.
export type ResultsSyncInfo = { count: number; lastSyncAt: string | null; closedAt: string | null };

export async function getResultsSyncInfo(eventUuid: string): Promise<ResultsSyncInfo> {
  if (!isUuid(eventUuid)) return { count: 0, lastSyncAt: null, closedAt: null };
  const supabase = await createServerSupabase();
  const [{ count }, { data: last }, { data: ev }] = await Promise.all([
    supabase.from("event_results").select("id", { count: "exact", head: true }).eq("event_id", eventUuid),
    supabase.from("event_results").select("updated_at").eq("event_id", eventUuid).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("events").select("results_closed_at").eq("id", eventUuid).maybeSingle(),
  ]);
  return { count: count ?? 0, lastSyncAt: last?.updated_at ?? null, closedAt: ev?.results_closed_at ?? null };
}
