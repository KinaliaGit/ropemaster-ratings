// Lógica pura de la lista de inscritos de un evento (KIN-612): cursor y páginas.
// Sin dependencias de Next para poder probarla con `node --test` (ver tests/enrolled.test.mjs).

export const ENROLLED_PAGE_SIZE = 30;

// El cursor es la fecha de inscripción (tal como la entrega la base, con sus microsegundos) y el id del ÚLTIMO inscrito recibido:
// "2026-11-01T11:00:00.123456+00:00~<uuid>". Texto simple y validado; no es secreto. No se pasa por Date para no perder precisión.
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?))~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type EnrolledCursor = { at: string; id: string };
export const encodeEnrolledCursor = (c: EnrolledCursor) => `${c.at}~${c.id}`;

export function decodeEnrolledCursor(raw: string | null): { ok: true; cursor: EnrolledCursor | null } | { ok: false } {
  if (raw === null || raw === "") return { ok: true, cursor: null };
  const m = CURSOR.exec(raw);
  if (!m || Number.isNaN(Date.parse(m[1]))) return { ok: false };
  return { ok: true, cursor: { at: m[1], id: m[2].toLowerCase() } };
}

export type EnrolledRow = { id: string; name: string; avatarPath: string | null; rating: number; events: number; wins: number; initial: boolean; enrolledAt: string };
export type EnrolledPage = { rows: EnrolledRow[]; next: string | null };

type DbRow = { roper_id: string; full_name: string; avatar_path: string | null; rating: number | string; events_count: number; wins: number; is_initial: boolean; enrolled_at: string };

/** Convierte lo que devuelve la base. Se pidió una fila de más: si llegó, hay otra página y el cursor apunta al último de ESTA. */
export function toEnrolledPage(data: DbRow[], limit: number): EnrolledPage {
  const more = data.length > limit;
  const rows = data.slice(0, limit).map((r) => ({
    id: r.roper_id, name: r.full_name, avatarPath: r.avatar_path, rating: Number(r.rating), events: r.events_count, wins: r.wins, initial: r.is_initial, enrolledAt: r.enrolled_at,
  }));
  const last = rows[rows.length - 1];
  return { rows, next: more && last ? encodeEnrolledCursor({ at: last.enrolledAt, id: last.id }) : null };
}
