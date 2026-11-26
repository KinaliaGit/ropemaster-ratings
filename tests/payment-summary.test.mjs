import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentSummary } from "../src/lib/payment-summary.ts";

const ARENA = { id: "ar-1", name: "Lienzo Charro del Norte" };
const ev = (id, name, date, arena = null) => ({ id, slug: `s-${id}`, name, date, status: "publicado", arena });
const tot = (eventId, o) => ({ eventId, slug: `s-${eventId}`, name: "", date: null, expectedCents: 0, paidCents: 0, pendingCents: 0, paidCount: 0, pendingCount: 0, ...o });

test("junta pagadas, pendientes y lista de espera de cada evento", () => {
  const out = buildPaymentSummary([ev("a", "Final", "2026-12-01", ARENA)], [tot("a", { paidCount: 2, pendingCount: 1, paidCents: 200000, pendingCents: 100000, expectedCents: 300000 })], new Map([["a", 3]]));
  assert.deepEqual(out, [{ eventId: "a", slug: "s-a", name: "Final", date: "2026-12-01", status: "publicado", arena: ARENA, paidCount: 2, pendingCount: 1, waitlistCount: 3, paidCents: 200000, pendingCents: 100000, expectedCents: 300000 }]);
});
test("un evento sin inscripciones ni espera sale con ceros, sin romper", () => {
  const [row] = buildPaymentSummary([ev("a", "Vacío", null)], [], new Map());
  assert.equal(row.paidCount + row.pendingCount + row.waitlistCount + row.paidCents + row.pendingCents + row.expectedCents, 0);
  assert.equal(row.arena, null);
});
test("sin eventos (organizador sin arenas o sin nada) devuelve una lista vacía", () => {
  assert.deepEqual(buildPaymentSummary([], [], new Map()), []);
});
test("los totales de eventos que no están en la lista (otra arena) se ignoran", () => {
  const out = buildPaymentSummary([ev("a", "Uno", "2026-01-01")], [tot("a", { paidCount: 1, paidCents: 5000, expectedCents: 5000 }), tot("zz", { paidCount: 9, paidCents: 999, expectedCents: 999 })], new Map([["zz", 4]]));
  assert.equal(out.length, 1);
  assert.equal(out[0].paidCount, 1);
  assert.equal(out[0].waitlistCount, 0);
});
test("la espera no suma al dinero esperado", () => {
  const [row] = buildPaymentSummary([ev("a", "Uno", "2026-01-01")], [tot("a", { pendingCount: 1, pendingCents: 70000, expectedCents: 70000 })], new Map([["a", 5]]));
  assert.equal(row.expectedCents, 70000);
  assert.equal(row.waitlistCount, 5);
});
test("orden: fecha más reciente primero, sin fecha al final, luego nombre", () => {
  const out = buildPaymentSummary([ev("1", "B", null), ev("2", "A", "2026-01-01"), ev("3", "C", "2026-06-01"), ev("4", "A", null)], [], new Map());
  assert.deepEqual(out.map((r) => r.eventId), ["3", "2", "4", "1"]);
});
