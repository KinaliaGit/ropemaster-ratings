// Lógica pura del ranking paginado (KIN-613): validar lo que pide el navegador y partir la búsqueda en palabras.
// Sin dependencias de Next para poder probarla con `node --test` (ver tests/ranking.test.mjs).
import type { DisciplineId } from "./disciplines";
import type { Roper } from "./types";

export const RANKING_PAGE_SIZE = 50;
export const MAX_QUERY_LENGTH = 60;
export const MAX_TOKENS = 5;

// Sin acentos ni mayúsculas (igual que la búsqueda de personas del navegador, src/lib/search.ts).
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Palabras de la búsqueda, listas para la base: normalizadas, sin repetidas y con un máximo. */
export function searchTokens(raw: string): string[] {
  const tokens = norm(raw.slice(0, MAX_QUERY_LENGTH)).split(/\s+/).filter(Boolean);
  return [...new Set(tokens)].slice(0, MAX_TOKENS);
}

export type RankingQuery = { discipline: DisciplineId; tokens: string[]; after: number | null };
export type ParsedRankingQuery = { ok: true; value: RankingQuery } | { ok: false; error: string };

/** Lee `?discipline=&q=&after=` de la petición. `active` son las modalidades activas; `after` es el último lugar recibido (entero >= 1). */
export function parseRankingQuery(url: URL, active: readonly string[]): ParsedRankingQuery {
  const discipline = url.searchParams.get("discipline");
  if (discipline === null || !active.includes(discipline)) return { ok: false, error: "Modalidad no válida" };
  const rawAfter = url.searchParams.get("after");
  let after: number | null = null;
  if (rawAfter !== null && rawAfter !== "") {
    if (!/^\d{1,9}$/.test(rawAfter) || Number(rawAfter) < 1) return { ok: false, error: "after no es válido" };
    after = Number(rawAfter);
  }
  return { ok: true, value: { discipline: discipline as DisciplineId, tokens: searchTokens(url.searchParams.get("q") ?? ""), after } };
}

export type RankedRow = { id: string; name: string; avatarPath: string | null; rating: number; events: number; wins: number; initial: boolean; rank: number };
export type RankingPage = { rows: RankedRow[]; next: number | null };

type DbRow = { roper_id: string; full_name: string; avatar_path: string | null; rating: number | string; events_count: number; wins: number; is_initial: boolean; rank: number | string };

/** Convierte lo que devuelve la base. Se pidió una fila de más: si llegó, hay otra página y `next` es el último lugar de ESTA. */
export function toRankingPage(data: DbRow[], limit: number): RankingPage {
  const more = data.length > limit;
  const rows = data.slice(0, limit).map((r) => ({
    id: r.roper_id, name: r.full_name, avatarPath: r.avatar_path, rating: Number(r.rating), events: r.events_count, wins: r.wins,
    initial: r.is_initial, rank: Number(r.rank),
  }));
  return { rows, next: more ? rows[rows.length - 1].rank : null };
}

/** Una fila del ranking como participante completo (para las tarjetas que ya reciben un Roper). */
export const rankedToRoper = (r: RankedRow, discipline: DisciplineId): Roper => ({
  id: r.id, name: r.name, avatarPath: r.avatarPath, stats: { [discipline]: { rating: r.rating, events: r.events, wins: r.wins, initial: r.initial } },
});
