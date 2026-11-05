import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_BATCH, MAX_BYTES, buildUploadResponse, closeResponse, parseCloseBody, parseReopenBody, parseUploadBody, reopenResponse,
} from "../src/lib/app-results.ts";

const example = (name) => readFileSync(new URL(`../docs/sync-examples/${name}`, import.meta.url), "utf8");
const EVENT = "e7d1b9a0-1111-4222-8333-444455556666";
const body = (extra = {}) => JSON.stringify({ contract_version: 1, results: [], ...extra });

test("el ejemplo del contrato es un lote válido y conserva el orden de los resultados", () => {
  const parsed = parseUploadBody(example("resultados.request.json"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.results.length, 4);
  assert.equal(parsed.clientBatchId, "5b0f9d1e-3c64-4e4e-9a52-0d6f4f1c7a10");
  assert.equal(parsed.results[3].participant_name, "Chuy Rodríguez", "un resultado sin lazador en la web lleva el nombre");
});

test("un cuerpo que no es JSON o no es un objeto se rechaza con 400", () => {
  for (const bad of ["", "no es json", "[]", "null", "42", '"texto"']) {
    const parsed = parseUploadBody(bad);
    assert.equal(parsed.ok, false, bad);
    assert.equal(parsed.status, 400, bad);
  }
});

test("la versión del contrato es obligatoria; una distinta pide actualizar (426)", () => {
  assert.equal(parseUploadBody(JSON.stringify({ results: [] })).status, 400, "sin contract_version");
  for (const version of [0, 2, "1", null, 1.5]) {
    const parsed = parseUploadBody(JSON.stringify({ contract_version: version, results: [] }));
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, 426, `versión ${JSON.stringify(version)}`);
    assert.equal(parsed.code, "version_unsupported");
  }
  assert.equal(parseUploadBody(body()).ok, true);
});

test("tamaño: más de 200 resultados o más de 256 KB se rechazan con 413 para partir el lote", () => {
  assert.equal(parseUploadBody(body({ results: Array.from({ length: MAX_BATCH }, () => ({})) })).ok, true, "200 sí");
  const many = parseUploadBody(body({ results: Array.from({ length: MAX_BATCH + 1 }, () => ({})) }));
  assert.equal(many.status, 413);
  const huge = parseUploadBody(body({ relleno: "x".repeat(MAX_BYTES) }));
  assert.equal(huge.status, 413);
  const accents = parseUploadBody(body({ relleno: "é".repeat(MAX_BYTES / 2) }));
  assert.equal(accents.status, 413, "se cuentan bytes, no letras");
});

test("results debe ser un arreglo y client_batch_id un UUID", () => {
  assert.equal(parseUploadBody(JSON.stringify({ contract_version: 1 })).status, 400);
  assert.equal(parseUploadBody(JSON.stringify({ contract_version: 1, results: {} })).status, 400);
  assert.equal(parseUploadBody(body({ client_batch_id: "no-uuid" })).status, 400);
  assert.equal(parseUploadBody(body({ client_batch_id: null })).clientBatchId, null);
});

test("la respuesta trae una entrada por resultado, en orden, y solo lo del contrato", () => {
  const rows = [
    { r_id: "a", r_status: "accepted", r_code: null, r_message: null, r_revision: 1, r_retry: false },
    { r_id: "b", r_status: "updated", r_code: null, r_message: null, r_revision: 2, r_retry: false },
    { r_id: "c", r_status: "unchanged", r_code: null, r_message: null, r_revision: 1, r_retry: false },
    { r_id: "d", r_status: "rejected", r_code: "roper_unknown", r_message: "roper_global_id no existe en la web", r_revision: null, r_retry: false },
    { r_id: "e", r_status: "rejected", r_code: "temporary_error", r_message: "Falla interna al guardar este resultado", r_revision: null, r_retry: true },
  ];
  const response = buildUploadResponse(rows, "5b0f9d1e-3c64-4e4e-9a52-0d6f4f1c7a10");
  assert.equal(response.contract_version, 1);
  assert.deepEqual(response.results.map((r) => r.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(response.results[0], { id: "a", status: "accepted", revision: 1 });
  assert.deepEqual(response.results[3], { id: "d", status: "rejected", code: "roper_unknown", message: "roper_global_id no existe en la web", retry: false });
  assert.equal(response.results[4].retry, true, "solo temporary_error se reintenta");
  const expected = JSON.parse(example("resultados.response.json"));
  assert.deepEqual(Object.keys(expected.results[2]).sort(), Object.keys(response.results[3]).sort(), "mismas llaves que el ejemplo del contrato");
});

test("cierre: expected_results es un entero >= 0", () => {
  assert.deepEqual(parseCloseBody(example("cierre.request.json")), { ok: true, expected: 3 });
  for (const bad of [{}, { expected_results: -1 }, { expected_results: 1.5 }, { expected_results: "3" }, { expected_results: null }]) {
    assert.equal(parseCloseBody(JSON.stringify({ contract_version: 1, ...bad })).status, 400, JSON.stringify(bad));
  }
  assert.equal(parseCloseBody(JSON.stringify({ contract_version: 1, expected_results: 0 })).ok, true, "un evento sin resultados también se puede cerrar");
  assert.equal(parseCloseBody(JSON.stringify({ contract_version: 2, expected_results: 1 })).status, 426);
});

test("cierre: cada resultado de la base se traduce al HTTP del contrato", () => {
  const closed = closeResponse("closed", EVENT, 3);
  assert.equal(closed.status, 200);
  assert.deepEqual(closed.body, JSON.parse(example("cierre.response.json")), "igual al ejemplo del contrato");
  assert.equal(closeResponse("already_closed", EVENT, 3).body.already_closed, true);
  const incomplete = closeResponse("incomplete", EVENT, 2);
  assert.equal(incomplete.status, 409);
  assert.equal(incomplete.body.code, "incomplete");
  assert.equal(incomplete.body.results_count, 2);
  assert.equal(closeResponse("not_found", EVENT, null).status, 404);
  assert.equal(closeResponse("cualquier otra cosa", EVENT, null).status, 404, "lo desconocido no revela nada");
});

test("reabrir: el motivo es obligatorio (5 a 500 caracteres) y se recorta", () => {
  assert.deepEqual(parseReopenBody(example("reabrir.request.json")), { ok: true, reason: "Corregí un castigo mal capturado en la segunda corrida" });
  assert.equal(parseReopenBody(JSON.stringify({ contract_version: 1, reason: "  ok  " })).status, 400);
  assert.equal(parseReopenBody(JSON.stringify({ contract_version: 1 })).code, "reason_required");
  assert.equal(parseReopenBody(JSON.stringify({ contract_version: 1, reason: 123 })).status, 400);
  assert.equal(parseReopenBody(JSON.stringify({ contract_version: 1, reason: "x".repeat(501) })).status, 400);
  assert.equal(parseReopenBody(JSON.stringify({ contract_version: 1, reason: "  motivo válido  " })).reason, "motivo válido");
});

test("reabrir: no cambia el estado del evento (sigue finalizado, así nadie puede inscribirse)", () => {
  const reopened = reopenResponse("reopened", EVENT);
  assert.equal(reopened.status, 200);
  assert.deepEqual(reopened.body, JSON.parse(example("reabrir.response.json")), "igual al ejemplo del contrato");
  assert.equal(reopened.body.status, "finalizado");
  assert.equal(reopened.body.results_closed, false);
  assert.equal(reopenResponse("already_open", EVENT).body.already_open, true);
  assert.equal(reopenResponse("reason_required", EVENT).status, 400);
  assert.equal(reopenResponse("not_found", EVENT).status, 404);
});

test("los ejemplos del contrato son coherentes: contadores, tiempos y castigos salen de las rondas", () => {
  for (const name of ["resultados.request.json", "resultados.correccion.request.json"]) {
    const { results } = JSON.parse(example(name));
    for (const result of results) {
      if (!result.rounds) continue;
      const done = result.rounds.filter((r) => r.status === "completed");
      assert.equal(result.completed_runs, done.length, `${name} ${result.id}: completed_runs`);
      assert.equal(result.nt_count, result.rounds.filter((r) => r.status === "no_time").length, `${name} ${result.id}: nt_count`);
      assert.equal(result.dq_count, result.rounds.filter((r) => r.status === "disqualified").length, `${name} ${result.id}: dq_count`);
      assert.equal(result.time_ms, done.length ? done.reduce((sum, r) => sum + r.time_ms, 0) : null, `${name} ${result.id}: time_ms es la suma de las rondas completadas`);
      assert.equal(result.penalty_ms, result.rounds.reduce((sum, r) => sum + r.penalty_ms, 0), `${name} ${result.id}: penalty_ms es la suma de los castigos`);
      for (const r of result.rounds) assert.equal(r.status === "completed", r.time_ms !== null, "solo las completadas llevan tiempo");
    }
  }
});
