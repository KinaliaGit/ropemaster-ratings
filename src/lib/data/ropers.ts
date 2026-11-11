import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { ACTIVE_DISCIPLINES, type DisciplineId } from "@/lib/disciplines";
import type { Roper, Stat } from "@/lib/types";
import { INITIAL_RATING } from "@/lib/rating";
import { RANKING_PAGE_SIZE, toRankingPage, type RankingPage } from "@/lib/ranking";
import { HISTORY_PAGE_SIZE, decodeHistoryCursor, toHistoryPage, toRounds, toSummary, type HistoryPage, type Round, type Summary } from "@/lib/results-history";

// Lecturas PÚBLICAS de participantes. Las columnas siempre se piden por nombre: user_id y el celular están
// ocultos a propósito (el celular vive en roper_contacts, solo para organizadores verificados).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RatingRow = { discipline: string; rating: number | string; events_count: number; wins: number; updated_at: string };

const initialStat = (): Stat => ({ rating: INITIAL_RATING, events: 0, wins: 0, initial: true });
const toStat = (r: RatingRow): Stat => ({ rating: Number(r.rating), events: r.events_count, wins: r.wins, updatedAt: r.updated_at });

// Ranking de una modalidad, de mayor a menor rating (y por nombre a igual rating), UNA PÁGINA a la vez (KIN-613). Lo ordena y numera la base
// (función public_ranking): el lugar de cada quien es sobre TODO el ranking, también al buscar. Entran TODOS los perfiles visibles: quien
// aún no tiene rating en esa modalidad aparece con el inicial (INITIAL_RATING). `after` es el último lugar de la página anterior.
async function fetchRankingPage(discipline: DisciplineId, tokens: string[], after: number | null): Promise<RankingPage> {
  const { data, error } = await createPublicClient().rpc("public_ranking", {
    p_discipline: discipline, p_initial: INITIAL_RATING, p_tokens: tokens, p_after_rank: after, p_limit: RANKING_PAGE_SIZE + 1,
  });
  if (error) throw new Error(`No se pudo leer el ranking: ${error.message}`);
  return toRankingPage((data ?? []) as Parameters<typeof toRankingPage>[0], RANKING_PAGE_SIZE);
}

// Páginas SIN búsqueda: son pocas y las ve todo el mundo, así que van en caché.
export async function listRankingPage(discipline: DisciplineId, after: number | null = null): Promise<RankingPage> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  return fetchRankingPage(discipline, [], after);
}

// Con búsqueda no se guarda en caché: cada texto distinto sería una entrada nueva.
export const searchRankingPage = fetchRankingPage;

// Un participante con todos sus ratings. null si no existe o el id no es válido.
export async function getPublicRoper(id: string): Promise<Roper | null> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  if (!UUID.test(id)) return null;
  const sb = createPublicClient();
  const [person, ratings] = await Promise.all([
    sb.from("ropers").select("id, full_name, avatar_path").eq("id", id).maybeSingle(),
    sb.from("roper_ratings").select("discipline, rating, events_count, wins, updated_at").eq("roper_id", id),
  ]);
  if (person.error) throw new Error(`No se pudo leer el participante: ${person.error.message}`);
  if (!person.data) return null;
  const stats: Roper["stats"] = {};
  for (const r of (ratings.data ?? []) as RatingRow[]) {
    if (ACTIVE_DISCIPLINES.some((d) => d.id === r.discipline)) stats[r.discipline as DisciplineId] = toStat(r);
  }
  for (const d of ACTIVE_DISCIPLINES) stats[d.id] ??= initialStat(); // sin rating aún: parte del inicial
  return { id: person.data.id, name: person.data.full_name, avatarPath: person.data.avatar_path, stats };
}

// Historial del lazador, UNA PÁGINA a la vez (KIN-609): de lo más reciente a lo más antiguo, solo de eventos publicados o finalizados.
// `cursor` es el que entregó la página anterior (ya validado por quien llama). Las rondas no viajan aquí: se piden aparte con getRoperRounds.
export async function getRoperHistory(id: string, cursor: string | null = null): Promise<HistoryPage> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  if (!UUID.test(id)) return { rows: [], next: null };
  const decoded = decodeHistoryCursor(cursor);
  const at = decoded.ok ? decoded.cursor : null;
  const { data, error } = await createPublicClient().rpc("public_roper_results", {
    p_roper: id, p_before_date: at?.date ?? null, p_before_id: at?.id ?? null, p_limit: HISTORY_PAGE_SIZE + 1,
  });
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  return toHistoryPage((data ?? []) as Parameters<typeof toHistoryPage>[0], HISTORY_PAGE_SIZE);
}

// Totales del lazador calculados en la base (resultados, eventos, victorias, mejor lugar y mejor corrida por modalidad).
export async function getRoperSummary(id: string): Promise<Summary> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  if (!UUID.test(id)) return toSummary(null);
  const { data, error } = await createPublicClient().rpc("public_roper_summary", { p_roper: id });
  if (error) throw new Error(`No se pudo leer el resumen: ${error.message}`);
  return toSummary((data as Parameters<typeof toSummary>[0][] | null)?.[0]);
}

// Rondas de UN resultado de ese lazador (null si no existe, no es suyo o su evento no es público).
export async function getRoperRounds(roperId: string, resultId: string): Promise<Round[] | null> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  if (!UUID.test(roperId) || !UUID.test(resultId)) return null;
  const { data, error } = await createPublicClient().from("event_results").select("rounds, events!inner(id)").eq("id", resultId).eq("roper_id", roperId).maybeSingle();
  if (error) throw new Error(`No se pudieron leer las rondas: ${error.message}`);
  return data ? toRounds(data.rounds) : null;
}

