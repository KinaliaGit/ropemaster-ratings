// Lógica pura de los endpoints de resultados de la app (KIN-587): lectura y validación del cuerpo, y forma de las respuestas.
// Sin dependencias para poder probarla con `node --test` (ver tests/app-results.test.mjs). El contrato está en docs/SYNC_API.md.

export const CONTRACT_VERSION = 1;
export const MAX_BATCH = 200;
export const MAX_BYTES = 256 * 1024;
export const REASON_MIN = 5;
export const REASON_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type Failure = { ok: false; status: 400 | 413 | 426; code: string; error: string };
const fail = (status: Failure["status"], code: string, error: string): Failure => ({ ok: false, status, code, error });

/** Lee el cuerpo JSON y comprueba tamaño y versión del contrato. */
function readBody(text: string): { ok: true; body: Record<string, unknown> } | Failure {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return fail(413, "payload_too_large", `El cuerpo pasa de ${MAX_BYTES / 1024} KB: parte el lote en mitades.`);
  let data: unknown;
  try { data = JSON.parse(text); } catch { return fail(400, "invalid_json", "El cuerpo no es un JSON válido."); }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fail(400, "invalid_body", "El cuerpo debe ser un objeto JSON.");
  const body = data as Record<string, unknown>;
  if (body.contract_version === undefined) return fail(400, "invalid_body", "Falta contract_version.");
  if (body.contract_version !== CONTRACT_VERSION) {
    return fail(426, "version_unsupported", `Esta web habla la versión ${CONTRACT_VERSION} del contrato. Actualiza la app.`);
  }
  return { ok: true, body };
}

export type UploadBody = { ok: true; results: unknown[]; clientBatchId: string | null };

export function parseUploadBody(text: string): UploadBody | Failure {
  const read = readBody(text);
  if (!read.ok) return read;
  const { results, client_batch_id: batch } = read.body;
  if (!Array.isArray(results)) return fail(400, "invalid_body", "results debe ser un arreglo.");
  if (results.length > MAX_BATCH) return fail(413, "payload_too_large", `Máximo ${MAX_BATCH} resultados por lote: parte el lote en mitades.`);
  if (batch !== undefined && batch !== null && !isUuid(batch)) return fail(400, "invalid_body", "client_batch_id debe ser un UUID.");
  return { ok: true, results, clientBatchId: typeof batch === "string" ? batch.toLowerCase() : null };
}

export function parseCloseBody(text: string): { ok: true; expected: number } | Failure {
  const read = readBody(text);
  if (!read.ok) return read;
  const expected = read.body.expected_results;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) {
    return fail(400, "invalid_body", "expected_results debe ser un entero mayor o igual a 0.");
  }
  return { ok: true, expected };
}

export function parseReopenBody(text: string): { ok: true; reason: string } | Failure {
  const read = readBody(text);
  if (!read.ok) return read;
  const reason = typeof read.body.reason === "string" ? read.body.reason.trim() : "";
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return fail(400, "reason_required", `El motivo es obligatorio (de ${REASON_MIN} a ${REASON_MAX} caracteres).`);
  }
  return { ok: true, reason };
}

export type UploadRow = { r_id: string; r_status: string; r_code: string | null; r_message: string | null; r_revision: number | null; r_retry: boolean };

/** Una entrada por resultado, en el mismo orden. Solo lo del contrato: nada interno de la base. */
export function buildUploadResponse(rows: UploadRow[], clientBatchId: string | null) {
  return {
    contract_version: CONTRACT_VERSION,
    client_batch_id: clientBatchId,
    results: rows.map((row) =>
      row.r_status === "rejected"
        ? { id: row.r_id, status: "rejected", code: row.r_code, message: row.r_message, retry: row.r_retry === true }
        : { id: row.r_id, status: row.r_status, revision: row.r_revision },
    ),
  };
}

export type CloseOutcome = "closed" | "already_closed" | "incomplete" | "not_found";
export type ReopenOutcome = "reopened" | "already_open" | "reason_required" | "not_found";

/** Respuesta HTTP del cierre según lo que devolvió la base. */
export function closeResponse(outcome: string, eventId: string, resultsCount: number | null): { status: number; body: Record<string, unknown> } {
  if (outcome === "closed" || outcome === "already_closed") {
    return { status: 200, body: { contract_version: CONTRACT_VERSION, event_id: eventId, status: "finalizado", results_count: resultsCount, already_closed: outcome === "already_closed" } };
  }
  if (outcome === "incomplete") {
    return { status: 409, body: { contract_version: CONTRACT_VERSION, code: "incomplete", error: "La web tiene otra cantidad de resultados: reenvía los que falten y vuelve a cerrar.", results_count: resultsCount } };
  }
  return { status: 404, body: { error: "Evento no encontrado" } };
}

/** Respuesta HTTP de reabrir. Reabrir NO cambia el estado del evento (sigue finalizado, así nadie puede inscribirse). */
export function reopenResponse(outcome: string, eventId: string): { status: number; body: Record<string, unknown> } {
  if (outcome === "reopened" || outcome === "already_open") {
    return { status: 200, body: { contract_version: CONTRACT_VERSION, event_id: eventId, status: "finalizado", results_closed: false, already_open: outcome === "already_open" } };
  }
  if (outcome === "reason_required") {
    return { status: 400, body: { code: "reason_required", error: `El motivo es obligatorio (de ${REASON_MIN} a ${REASON_MAX} caracteres).` } };
  }
  return { status: 404, body: { error: "Evento no encontrado" } };
}
