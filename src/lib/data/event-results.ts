import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { EVENT_RESULTS_PAGE_SIZE, isUuid, toEventResultsPage, type EventResultsPage } from "@/lib/event-results";
import { toRounds, type Round } from "@/lib/results-history";

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
