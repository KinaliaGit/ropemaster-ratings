// Resultados en vivo (KIN-787, H13.6): lógica pura del envío de la foto de la ronda y de su lectura pública. Sin dependencias, para probarla con
// `node --test` (ver tests/app-live.test.mjs). El contrato está en docs/SYNC_API.md ("Resultados en vivo").
//
// La app manda la foto COMPLETA cada vez (no cambios): 90 equipos caben en pocos KB y así la web nunca arma el estado a partir de pedazos. Cada foto trae
// una `revision` que solo sube; reenviar la misma es inofensivo y una más vieja no pisa a una más nueva. Aquí NO viaja nada privado: solo números de turno,
// nombres y tiempos, que ya son públicos en los resultados.

import type { LiveSnapshot, LiveTeam } from "./live.ts";

export const CONTRACT_VERSION = 1;
export const MAX_LIVE_BYTES = 256 * 1024;
export const MAX_TEAMS = 1000;       // equipos por lista (los que faltan o las posiciones)
export const NAME_MAX = 80;
export const MAX_ROUNDS = 20;

/** Lo que se guarda en la base: la foto sin el nombre ni la arena del evento (esos salen del evento al leerla) ni la hora (la pone la base). */
export type StoredLive = Omit<LiveSnapshot, "name" | "venue" | "updatedAt">;

export type LiveFailure = { ok: false; status: 400 | 413 | 426; code: string; error: string };
export type LiveBody = { ok: true; revision: number; snapshot: StoredLive };
const fail = (status: LiveFailure["status"], code: string, error: string): LiveFailure => ({ ok: false, status, code, error });

const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Nombre limpio: sin caracteres de control, espacios colapsados y recortado. */
const cleanName = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const text = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX).trim();
  return text || null;
};

function parseTeam(raw: unknown, where: string): LiveTeam | LiveFailure {
  if (!isObject(raw)) return fail(400, "invalid_field", `${where}: cada equipo debe ser un objeto.`);
  if (!isInt(raw.n, 1, 100000)) return fail(400, "invalid_field", `${where}: n (turno) debe ser un entero mayor o igual a 1.`);
  const header = cleanName(raw.header);
  const heeler = cleanName(raw.heeler);
  if (!header || !heeler) return fail(400, "invalid_field", `${where}: header y heeler deben ser texto no vacío.`);
  const total = raw.total_ms;
  if (total !== null && total !== undefined && !isInt(total, 0, 3_600_000)) return fail(400, "invalid_field", `${where}: total_ms debe ser un entero en milisegundos o null.`);
  return { n: raw.n, header, heeler, totalMs: total ?? null };
}

function parseTeams(raw: unknown, where: string): LiveTeam[] | LiveFailure {
  if (!Array.isArray(raw)) return fail(400, "invalid_field", `${where} debe ser un arreglo.`);
  if (raw.length > MAX_TEAMS) return fail(413, "payload_too_large", `${where} pasa de ${MAX_TEAMS} equipos.`);
  const out: LiveTeam[] = [];
  for (const item of raw) {
    const team = parseTeam(item, where);
    if ("ok" in team) return team;
    out.push(team);
  }
  return out;
}

/** Cuerpo de POST /api/app/eventos/<id>/en-vivo. */
export function parseLiveBody(text: string): LiveBody | LiveFailure {
  if (new TextEncoder().encode(text).length > MAX_LIVE_BYTES) return fail(413, "payload_too_large", `El cuerpo pasa de ${MAX_LIVE_BYTES / 1024} KB.`);
  let data: unknown;
  try { data = JSON.parse(text); } catch { return fail(400, "invalid_json", "El cuerpo no es un JSON válido."); }
  if (!isObject(data)) return fail(400, "invalid_body", "El cuerpo debe ser un objeto JSON.");
  if (data.contract_version === undefined) return fail(400, "invalid_body", "Falta contract_version.");
  if (data.contract_version !== CONTRACT_VERSION) return fail(426, "version_unsupported", `Esta web habla la versión ${CONTRACT_VERSION} del contrato. Actualiza la app.`);

  if (!isInt(data.revision, 1)) return fail(400, "invalid_field", "revision debe ser un entero mayor o igual a 1.");
  if (!isInt(data.rounds, 1, MAX_ROUNDS)) return fail(400, "invalid_field", `rounds debe ser un entero de 1 a ${MAX_ROUNDS}.`);
  if (!isInt(data.round, 1, MAX_ROUNDS) || data.round > data.rounds) return fail(400, "invalid_field", "round debe ser un entero de 1 hasta rounds.");
  if (!isInt(data.total, 0, MAX_TEAMS)) return fail(400, "invalid_field", `total debe ser un entero de 0 a ${MAX_TEAMS}.`);
  if (!isInt(data.done, 0) || data.done > data.total) return fail(400, "invalid_field", "done debe ser un entero de 0 hasta total.");

  let current: LiveTeam | null = null;
  if (data.current !== null && data.current !== undefined) {
    const team = parseTeam(data.current, "current");
    if ("ok" in team) return team;
    current = team;
  }
  const pending = parseTeams(data.pending, "pending");
  if (!Array.isArray(pending)) return pending;
  const standings = parseTeams(data.standings, "standings");
  if (!Array.isArray(standings)) return standings;

  if (data.short_go !== undefined && typeof data.short_go !== "boolean") return fail(400, "invalid_field", "short_go debe ser verdadero o falso.");
  // Solo se guarda cuando es verdad: una app anterior no lo manda y la ronda se muestra como una normal.
  const shortGo = data.short_go === true ? { shortGo: true } : {};
  return { ok: true, revision: data.revision, snapshot: { round: data.round, rounds: data.rounds, ...shortGo, total: data.total, done: data.done, current, pending, standings } };
}

/** Respuesta HTTP de guardar la foto, según lo que contestó `app_put_live_snapshot`. */
export function liveResponse(outcome: string, eventId: string, revision: number | null): { status: number; body: Record<string, unknown> } {
  if (outcome === "stored" || outcome === "unchanged") {
    return { status: 200, body: { contract_version: CONTRACT_VERSION, event_id: eventId, revision, unchanged: outcome === "unchanged" } };
  }
  if (outcome === "stale") {
    return { status: 409, body: { contract_version: CONTRACT_VERSION, code: "stale_revision", error: "La web ya tiene una foto más reciente.", revision } };
  }
  return { status: 404, body: { error: "Evento no encontrado" } };
}

// ---- Lectura pública ----

/** Lo que devuelve `get_live_snapshot`. */
export type LiveRow = { revision: number | string; snapshot: StoredLive; updated_at: string; event_name: string; venue: string | null; city: string | null };

/** ¿La app está publicando resultados en vivo de este evento? (`get_live_snapshot` solo contesta con foto para eventos publicados o finalizados y públicos.) */
export const isPublishingLive = (data: unknown): boolean => Array.isArray(data) && data.length > 0;

/** La foto lista para la pantalla (`LiveBoard`): le agrega el nombre y la arena reales del evento y la hora del último cambio. */
export function toLiveSnapshot(row: LiveRow): LiveSnapshot {
  return { ...row.snapshot, name: row.event_name, venue: [row.venue, row.city].filter(Boolean).join(", "), updatedAt: row.updated_at };
}

/** ETag de una revisión. Cambia solo cuando la app manda una foto nueva. */
export const liveEtag = (revision: number | string) => `"live-${revision}"`;

/** ¿El navegador ya tiene esta versión? (`If-None-Match` puede traer varias, con `W/` o `*`.) */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((part) => {
    const value = part.trim().replace(/^W\//, "");
    return value === "*" || value === etag;
  });
}
