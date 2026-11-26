// Lógica pura de los resultados de un evento (KIN-608): validar lo que pide el navegador y armar las páginas.
// Sin dependencias de Next para poder probarla con `node --test` (ver tests/event-results.test.mjs).

export const EVENT_RESULTS_PAGE_SIZE = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type EventResultsQuery = { discipline: string; after: number | null; q: string };
export type ParsedEventResultsQuery = { ok: true; value: EventResultsQuery } | { ok: false; error: string };

/** Lee `?discipline=&after=`. `active` son las modalidades activas; `after` es la última posición recibida (entero >= 1). */
export function parseEventResultsQuery(url: URL, active: readonly string[]): ParsedEventResultsQuery {
  const discipline = url.searchParams.get("discipline");
  if (discipline === null || !active.includes(discipline)) return { ok: false, error: "Modalidad no válida" };
  const rawAfter = url.searchParams.get("after");
  let after: number | null = null;
  if (rawAfter !== null && rawAfter !== "") {
    if (!/^\d{1,9}$/.test(rawAfter) || Number(rawAfter) < 1) return { ok: false, error: "after no es válido" };
    after = Number(rawAfter);
  }
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80); // KIN-768: nombre del lazador que se busca
  return { ok: true, value: { discipline, after, q } };
}

export type EventResultRow = {
  id: string; roperId: string | null; name: string; avatarPath: string | null; timeMs: number | null; penaltyMs: number; disqualified: boolean;
  place: number | null; completedRuns: number | null; ntCount: number | null; dqCount: number | null; hasRounds: boolean; pos: number;
  packages: number | null; shots: number | null; // Lazada Sorteada (KIN-648); null en lo demás
};
export type EventResultsPage = { rows: EventResultRow[]; next: number | null; total: number };

type DbRow = {
  id: string; roper_id: string | null; name: string; avatar_path: string | null; time_ms: number | null; penalty_ms: number | null; disqualified: boolean;
  place: number | null; completed_runs: number | null; nt_count: number | null; dq_count: number | null; has_rounds: boolean; pos: number | string; total: number | string;
  packages?: number | null; shots?: number | null; // una base sin la migración 0048 no los manda
};

/** Convierte lo que devuelve la base. Se pidió una fila de más: si llegó, hay otra página y `next` es la última posición de ESTA. */
export function toEventResultsPage(data: DbRow[], limit: number): EventResultsPage {
  const more = data.length > limit;
  const rows = data.slice(0, limit).map((r) => ({
    id: r.id, roperId: r.roper_id, name: r.name, avatarPath: r.avatar_path, timeMs: r.time_ms, penaltyMs: r.penalty_ms ?? 0, disqualified: r.disqualified,
    place: r.place, completedRuns: r.completed_runs, ntCount: r.nt_count, dqCount: r.dq_count, hasRounds: r.has_rounds, pos: Number(r.pos), packages: r.packages ?? null, shots: r.shots ?? null,
  }));
  return { rows, next: more ? rows[rows.length - 1].pos : null, total: data.length ? Number(data[0].total) : 0 };
}
