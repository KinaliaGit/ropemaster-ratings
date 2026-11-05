// Lógica pura de `GET /api/app/participantes` (KIN-586): lectura de parámetros, cursor, regla de organizador activo y forma de la respuesta.
// Sin dependencias para poder probarla con `node --test` (ver tests/app-participants.test.mjs).
//
// La sincronización de participantes es SIEMPRE por evento: `event_id` es obligatorio y nunca hay un modo "todo el directorio".

export const PAGE_SIZE = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type Cursor = { changedAt: string; id: string; snapshot: string };
export type ParticipantsQuery = { eventId: string; since: string | null; cursor: Cursor | null };

/** Fecha ISO válida (normalizada a UTC) o null. */
export function parseIso(raw: string): string | null {
  if (!TIMESTAMP.test(raw.trim())) return null;
  const time = Date.parse(raw.trim());
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// El cursor es opaco para la app: guarda hasta dónde llegó (último cambio e id) y el corte de la consulta, para que todas las
// páginas de una misma descarga compartan `generated_at`.
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify({ c: cursor.changedAt, i: cursor.id, g: cursor.snapshot })).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const data = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { c?: unknown; i?: unknown; g?: unknown };
    if (typeof data.c !== "string" || typeof data.g !== "string" || !isUuid(data.i)) return null;
    if (!TIMESTAMP.test(data.c) || !TIMESTAMP.test(data.g)) return null;
    return { changedAt: data.c, id: data.i, snapshot: data.g };
  } catch {
    return null;
  }
}

export type ParsedQuery = { ok: true; value: ParticipantsQuery } | { ok: false; error: string };

export function parseParticipantsQuery(url: URL): ParsedQuery {
  const eventId = url.searchParams.get("event_id")?.trim() ?? "";
  if (!eventId) return { ok: false, error: "Falta event_id: los participantes se piden siempre de un evento." };
  if (!isUuid(eventId)) return { ok: false, error: "event_id no es válido." };
  const sinceRaw = url.searchParams.get("since");
  let since: string | null = null;
  if (sinceRaw) {
    since = parseIso(sinceRaw);
    if (!since) return { ok: false, error: "since no es una fecha válida (ISO-8601)." };
  }
  const cursorRaw = url.searchParams.get("cursor");
  let cursor: Cursor | null = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return { ok: false, error: "cursor no es válido." };
  }
  return { ok: true, value: { eventId: eventId.toLowerCase(), since, cursor } };
}

/** Organizador activo: aprobado a mano por un admin o con licencia vigente (igual que `private.organizer_active()` en la base). */
export function isOrganizerActive(
  profile: { organizer_verified: boolean | null; license_valid_until: string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!profile) return false;
  if (profile.organizer_verified) return true;
  const until = profile.license_valid_until;
  if (!until) return false;
  if (until === "infinity") return true; // licencia sin vencimiento
  const time = Date.parse(until);
  return !Number.isNaN(time) && time > now;
}

export type StoredRating = { rating: number; events: number; wins: number; updated_at: string | null };
export type ApiRating = { rating: number; events: number; wins: number; updated_at: string | null };

/**
 * Un rating por modalidad ACTIVA. Quien aún no tiene rating en una modalidad empieza en `initialRating` (decisión de Ana,
 * 2026-11-05: empiezan en 1), igual que se muestra en la web. Las modalidades que la web no tiene activas no se envían.
 */
export function buildRatings(
  stored: Record<string, StoredRating> | null | undefined,
  activeDisciplines: readonly string[],
  initialRating: number,
): Record<string, ApiRating> {
  const result: Record<string, ApiRating> = {};
  for (const discipline of activeDisciplines) {
    const found = stored?.[discipline];
    result[discipline] = found
      ? { rating: Number(found.rating), events: found.events, wins: found.wins, updated_at: found.updated_at }
      : { rating: initialRating, events: 0, wins: 0, updated_at: null };
  }
  return result;
}

export type ParticipantRow = {
  global_id: string;
  name: string;
  email: string | null;
  claimed: boolean;
  changed_at: string;
  ratings: Record<string, StoredRating> | null;
};

/** Respuesta de una página. Nunca incluye celular ni ids de cuenta. */
export function buildPage(rows: ParticipantRow[], snapshot: string, activeDisciplines: readonly string[], initialRating: number) {
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  return {
    participants: page.map((row) => ({
      global_id: row.global_id,
      name: row.name,
      email: row.email,
      claimed: row.claimed,
      ratings: buildRatings(row.ratings, activeDisciplines, initialRating),
    })),
    next_cursor: hasMore && last ? encodeCursor({ changedAt: last.changed_at, id: last.global_id, snapshot }) : null,
    generated_at: snapshot,
  };
}
