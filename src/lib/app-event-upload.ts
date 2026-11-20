// Lógica pura de `POST /api/app/eventos` (KIN-648, entrega 2): la app crea un evento (y su serie) y lo sube a la web.
// Sin dependencias para poder probarla con `node --test` (ver tests/app-event-upload.test.mjs). El contrato está en docs/SYNC_API.md.
//
// Reglas: el evento nace SIEMPRE como borrador; reenviar el mismo `app_id` no duplica ni modifica nada; solo eventos de equipo (casual).

export const CONTRACT_VERSION = 1;
export const MAX_BYTES = 8 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DRAW_TYPES = ["round_robin", "lazada_sorteada"] as const;
type DrawType = (typeof DRAW_TYPES)[number];

export type Failure = { ok: false; status: 400 | 413 | 426; code: string; error: string };
const fail = (status: Failure["status"], code: string, error: string): Failure => ({ ok: false, status, code, error });

export type SeriesInput = { app_id: string; slug: string; name: string; start_date: string; end_date: string };
export type EventInput = {
  app_id: string; slug: string; name: string; date: string; venue: string; disciplines: string[]; draw_type: DrawType;
  shots: number | null; max_roper_rating: number | null; max_team_rating: number | null; entry_fee_cents: number;
};
export type UploadEventBody = { ok: true; event: EventInput; series: SeriesInput | null };

const isRealDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const textOf = (value: unknown, max: number): string | null => (typeof value === "string" ? value.trim().slice(0, max) : null);

// Mismo formato de enlace que la web (nombre sin acentos + sufijo al azar), pero recibe el sufijo para poder probarlo.
export function slugFrom(name: string, suffix: string, fallback: string): string {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || fallback;
  return `${base}-${suffix}`;
}
const randomSuffix = () => Math.random().toString(36).slice(2, 6).padEnd(4, "0");

/** Número con un decimal entre 0 y `max`, o null si no viene. `undefined` si no cumple. */
function ratingOrNull(value: unknown, max: number): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) return undefined;
  return Math.round(value * 10) / 10;
}

export function parseUploadEventBody(text: string, suffix: () => string = randomSuffix): UploadEventBody | Failure {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return fail(413, "payload_too_large", "El cuerpo es demasiado grande.");
  let data: unknown;
  try { data = JSON.parse(text); } catch { return fail(400, "invalid_json", "El cuerpo no es un JSON válido."); }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fail(400, "invalid_body", "El cuerpo debe ser un objeto JSON.");
  const body = data as Record<string, unknown>;
  if (body.contract_version === undefined) return fail(400, "invalid_body", "Falta contract_version.");
  if (body.contract_version !== CONTRACT_VERSION) {
    return fail(426, "version_unsupported", `Esta web habla la versión ${CONTRACT_VERSION} del contrato. Actualiza la app.`);
  }

  const ev = body.event;
  if (typeof ev !== "object" || ev === null || Array.isArray(ev)) return fail(400, "invalid_body", "Falta event.");
  const e = ev as Record<string, unknown>;
  if (typeof e.app_id !== "string" || !UUID.test(e.app_id)) return fail(400, "invalid_field", "event.app_id debe ser un UUID.");
  const name = textOf(e.name, 120);
  if (!name) return fail(400, "invalid_field", "event.name es obligatorio (hasta 120 caracteres).");
  if (!isRealDate(e.date)) return fail(400, "invalid_field", "event.date debe ser una fecha AAAA-MM-DD.");
  const venue = e.venue === undefined || e.venue === null ? "" : textOf(e.venue, 120);
  if (venue === null) return fail(400, "invalid_field", "event.venue debe ser texto.");
  if (!Array.isArray(e.disciplines) || e.disciplines.length === 0 || e.disciplines.some((d) => d !== "lazo")) {
    return fail(400, "invalid_field", "event.disciplines debe ser una lista no vacía con modalidades activas (hoy solo lazo).");
  }
  const drawType = DRAW_TYPES.find((t) => t === e.draw_type);
  if (!drawType) return fail(400, "invalid_field", "event.draw_type debe ser round_robin o lazada_sorteada.");
  let shots: number | null = null;
  if (drawType === "lazada_sorteada") {
    if (e.lazada_shots_per_package !== undefined && e.lazada_shots_per_package !== null) {
      const n = e.lazada_shots_per_package;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 999) return fail(400, "invalid_field", "event.lazada_shots_per_package debe ser un entero de 1 a 999.");
      shots = n;
    }
  } else if (e.lazada_shots_per_package !== undefined && e.lazada_shots_per_package !== null) {
    return fail(400, "invalid_field", "event.lazada_shots_per_package solo existe en lazada_sorteada.");
  }
  const roper = ratingOrNull(e.max_roper_rating, 10);
  if (roper === undefined) return fail(400, "invalid_field", "event.max_roper_rating debe estar entre 0 y 10.");
  const team = ratingOrNull(e.max_team_rating, 20);
  if (team === undefined) return fail(400, "invalid_field", "event.max_team_rating debe estar entre 0 y 20.");
  const fee = e.entry_fee_cents === undefined || e.entry_fee_cents === null ? 0 : e.entry_fee_cents;
  if (typeof fee !== "number" || !Number.isInteger(fee) || fee < 0 || fee > 100_000_000) return fail(400, "invalid_field", "event.entry_fee_cents debe ser un entero en centavos.");

  let series: SeriesInput | null = null;
  if (body.series !== undefined && body.series !== null) {
    if (typeof body.series !== "object" || Array.isArray(body.series)) return fail(400, "invalid_body", "series debe ser un objeto o null.");
    const s = body.series as Record<string, unknown>;
    if (typeof s.app_id !== "string" || !UUID.test(s.app_id)) return fail(400, "invalid_field", "series.app_id debe ser un UUID.");
    const sName = textOf(s.name, 120);
    if (!sName || sName.length < 2) return fail(400, "invalid_field", "series.name es obligatorio (de 2 a 120 caracteres).");
    if (!isRealDate(s.start_date) || !isRealDate(s.end_date) || s.end_date < s.start_date) {
      return fail(400, "invalid_field", "series.start_date y series.end_date deben ser fechas AAAA-MM-DD, la de fin no antes que la de inicio.");
    }
    series = { app_id: s.app_id.toLowerCase(), slug: slugFrom(sName, suffix(), "serie"), name: sName, start_date: s.start_date, end_date: s.end_date };
  }

  return {
    ok: true,
    series,
    event: {
      app_id: e.app_id.toLowerCase(), slug: slugFrom(name, suffix(), "evento"), name, date: e.date, venue, disciplines: ["lazo"], draw_type: drawType,
      shots, max_roper_rating: roper, max_team_rating: team, entry_fee_cents: fee,
    },
  };
}

export type UploadEventRow = {
  r_event_id: string; r_event_slug: string; r_event_created: boolean;
  r_series_id: string | null; r_series_slug: string | null; r_series_created: boolean;
};

export function buildUploadEventResponse(row: UploadEventRow) {
  return {
    contract_version: CONTRACT_VERSION,
    created: row.r_event_created,
    event: { id: row.r_event_id, slug: row.r_event_slug, status: "borrador" as const },
    series: row.r_series_id ? { id: row.r_series_id, slug: row.r_series_slug as string, created: row.r_series_created } : null,
  };
}

/** Errores de la base (`raise exception '<código>'`) que son culpa de los datos y no del servidor. */
export function dbFailure(message: string): { status: 409 | 422; code: string; error: string } | null {
  if (message.includes("outside_series")) return { status: 422, code: "outside_series", error: "La fecha del evento cae fuera de las fechas de su serie." };
  if (message.includes("series_full")) return { status: 422, code: "series_full", error: "La serie ya tiene 30 eventos en la web." };
  if (message.includes("events_slug_key") || message.includes("event_series_slug_key")) return { status: 409, code: "slug_taken", error: "El enlace del evento ya existe. Reintenta." };
  return null;
}
