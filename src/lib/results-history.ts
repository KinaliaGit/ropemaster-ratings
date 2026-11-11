// Lógica pura del historial del lazador (KIN-609): cursor, páginas, resumen y rondas.
// Sin dependencias de Next para poder probarla con `node --test` (ver tests/results-history.test.mjs).

export const HISTORY_PAGE_SIZE = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR = /^(\d{4}-\d{2}-\d{2})~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

// El cursor es la fecha y el id del ÚLTIMO resultado recibido: "2026-10-04~<uuid>". Texto simple y validado; no es secreto.
export type HistoryCursor = { date: string; id: string };
export const encodeHistoryCursor = (c: HistoryCursor) => `${c.date}~${c.id}`;

export function decodeHistoryCursor(raw: string | null): { ok: true; cursor: HistoryCursor | null } | { ok: false } {
  if (raw === null || raw === "") return { ok: true, cursor: null };
  const m = CURSOR.exec(raw);
  if (!m) return { ok: false };
  const date = m[1];
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return { ok: false };
  return { ok: true, cursor: { date, id: m[2].toLowerCase() } };
}

export type HistoryRow = {
  id: string; event: string; eventSlug: string | null; date: string; eventVerified: boolean; discipline: string;
  timeMs: number | null; penaltyMs: number; disqualified: boolean; place: number | null;
  completedRuns: number | null; ntCount: number | null; dqCount: number | null; hasRounds: boolean;
};
export type HistoryPage = { rows: HistoryRow[]; next: string | null };

type DbHistoryRow = {
  id: string; event_name: string; event_slug: string | null; event_date: string; event_verified: boolean; discipline: string;
  time_ms: number | null; penalty_ms: number | null; disqualified: boolean; place: number | null;
  completed_runs: number | null; nt_count: number | null; dq_count: number | null; has_rounds: boolean;
};

/** Convierte lo que devuelve la base. Se pidió una fila de más: si llegó, hay otra página y el cursor apunta al último de ESTA. */
export function toHistoryPage(data: DbHistoryRow[], limit: number): HistoryPage {
  const more = data.length > limit;
  const rows = data.slice(0, limit).map((r) => ({
    id: r.id, event: r.event_name, eventSlug: r.event_slug, date: String(r.event_date).slice(0, 10), eventVerified: r.event_verified, discipline: r.discipline,
    timeMs: r.time_ms, penaltyMs: r.penalty_ms ?? 0, disqualified: r.disqualified, place: r.place,
    completedRuns: r.completed_runs, ntCount: r.nt_count, dqCount: r.dq_count, hasRounds: r.has_rounds,
  }));
  const last = rows[rows.length - 1];
  return { rows, next: more && last ? encodeHistoryCursor({ date: last.date, id: last.id }) : null };
}

export type Summary = { results: number; events: number; wins: number; bestPlace: number | null; bestRuns: Record<string, number> };
type DbSummary = { results_count: number; events_count: number; wins: number; best_place: number | null; best_runs: Record<string, number> | null };

export function toSummary(row: DbSummary | undefined | null): Summary {
  return {
    results: row?.results_count ?? 0, events: row?.events_count ?? 0, wins: row?.wins ?? 0,
    bestPlace: row?.best_place ?? null, bestRuns: row?.best_runs ?? {},
  };
}

export type Round = {
  round: number; stage: "preliminary" | "final" | "tiebreak"; kind: "regular" | "extra" | "help"; status: "completed" | "no_time" | "disqualified";
  timeMs: number | null; penaltyMs: number; substitution: { role: "header" | "heeler"; name: string; countsForSubstitute: boolean } | null;
};

const STAGES = ["preliminary", "final", "tiebreak"], KINDS = ["regular", "extra", "help"], STATUSES = ["completed", "no_time", "disqualified"];

/** Rondas tal como las guardó la web (ya normalizadas), en el mismo orden. Lo que no cumpla la forma se ignora en vez de romper la pantalla. */
export function toRounds(raw: unknown): Round[] {
  if (!Array.isArray(raw)) return [];
  const out: Round[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.round !== "number" || !STAGES.includes(r.stage as string) || !KINDS.includes(r.kind as string) || !STATUSES.includes(r.status as string)) continue;
    const sub = r.substitution as Record<string, unknown> | null | undefined;
    out.push({
      round: r.round, stage: r.stage as Round["stage"], kind: r.kind as Round["kind"], status: r.status as Round["status"],
      timeMs: typeof r.time_ms === "number" ? r.time_ms : null, penaltyMs: typeof r.penalty_ms === "number" ? r.penalty_ms : 0,
      substitution: sub && typeof sub.substitute_name === "string" && (sub.role === "header" || sub.role === "heeler")
        ? { role: sub.role, name: sub.substitute_name, countsForSubstitute: sub.counts_for_substitute === true } : null,
    });
  }
  return out;
}
