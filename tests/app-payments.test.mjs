import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_BATCH, MAX_BYTES } from "../src/lib/app-results.ts";
import { buildPaymentsResponse, parsePaymentsBody } from "../src/lib/app-results.ts";

const example = (name) => readFileSync(new URL(`../docs/sync-examples/${name}`, import.meta.url), "utf8");
const body = (extra = {}) => JSON.stringify({ contract_version: 1, payments: [], ...extra });

test("el ejemplo del contrato es un lote válido y conserva el orden de los pagos", () => {
  const parsed = parsePaymentsBody(example("pagos.request.json"));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.payments.length, 4);
  assert.equal(parsed.clientBatchId, "7c2d1e90-5a43-4b8e-8f11-3e6a9b0d4c21");
  assert.equal(parsed.payments[2].paid_by_global_id, "0c9a7d52-2222-4333-8444-555566667777", "un pago por otra persona lleva quién pagó");
  assert.equal(parsed.payments[1].status, "pendiente", "un abono parcial sigue pendiente con lo pagado");
});

test("un cuerpo que no es JSON o no es un objeto se rechaza con 400", () => {
  for (const bad of ["", "no es json", "[]", "null", "42"]) {
    const parsed = parsePaymentsBody(bad);
    assert.equal(parsed.ok, false, bad);
    assert.equal(parsed.status, 400, bad);
  }
});

test("la versión del contrato es obligatoria; una distinta pide actualizar (426)", () => {
  assert.equal(parsePaymentsBody(JSON.stringify({ payments: [] })).status, 400);
  for (const version of [0, 2, "1", null]) {
    const parsed = parsePaymentsBody(JSON.stringify({ contract_version: version, payments: [] }));
    assert.equal(parsed.status, 426, `versión ${JSON.stringify(version)}`);
    assert.equal(parsed.code, "version_unsupported");
  }
});

test("payments debe ser un arreglo y el lote tiene tope de tamaño y de cantidad", () => {
  assert.equal(parsePaymentsBody(body({ payments: {} })).status, 400);
  assert.equal(parsePaymentsBody(body({ payments: Array.from({ length: MAX_BATCH }, () => ({})) })).ok, true);
  assert.equal(parsePaymentsBody(body({ payments: Array.from({ length: MAX_BATCH + 1 }, () => ({})) })).status, 413);
  assert.equal(parsePaymentsBody(body({ note: "x".repeat(MAX_BYTES) })).status, 413);
  assert.equal(parsePaymentsBody(body({ client_batch_id: "no-es-uuid" })).status, 400);
});

test("la respuesta trae una entrada por pago y solo lo del contrato", () => {
  const response = buildPaymentsResponse(
    [
      { r_id: "a", r_status: "accepted", r_code: null, r_message: null, r_revision: 1, r_retry: false },
      { r_id: "b", r_status: "rejected", r_code: "paid_online", r_message: "x", r_revision: null, r_retry: false },
      { r_id: "c", r_status: "rejected", r_code: "temporary_error", r_message: "y", r_revision: null, r_retry: true },
    ],
    null,
  );
  assert.deepEqual(response.payments, [
    { id: "a", status: "accepted", revision: 1 },
    { id: "b", status: "rejected", code: "paid_online", message: "x", retry: false },
    { id: "c", status: "rejected", code: "temporary_error", message: "y", retry: true },
  ]);
  assert.equal(response.contract_version, 1);
  const expected = JSON.parse(example("pagos.response.json"));
  assert.equal(expected.payments.length, 4, "el ejemplo de respuesta cubre los 4 pagos del de petición");
});
