import test from "node:test";
import assert from "node:assert/strict";
import { parseLicenseResponse } from "../src/lib/licencias-parse.ts";

const future = new Date(Date.now() + 30 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

test("licencia vigente con fecha futura", () => {
  const r = parseLicenseResponse({ valid: true, plan: "local", order_id: "ORD-1", valid_until: future });
  assert.equal(r.status, "valid"); assert.equal(r.until, future); assert.equal(r.orderId, "ORD-1");
});
test("licencia sin vencimiento: until null", () => {
  const r = parseLicenseResponse({ valid: true, plan: "event_pass", order_id: "F-9", valid_until: null });
  assert.deepEqual(r, { status: "valid", until: null, plan: "event_pass", orderId: "F-9" });
});
test("sin licencia vigente", () => assert.deepEqual(parseLicenseResponse({ valid: false }), { status: "none" }));
test("una fecha ya pasada no se acepta aunque la base diga vigente", () => assert.equal(parseLicenseResponse({ valid: true, plan: "local", valid_until: past }).status, "none"));
test("fecha ilegible falla cerrado", () => assert.equal(parseLicenseResponse({ valid: true, plan: "local", valid_until: "no-es-fecha" }).status, "unavailable"));
test("plan desconocido no habilita", () => assert.equal(parseLicenseResponse({ valid: true, plan: "otro", valid_until: null }).status, "none"));
test("respuestas raras se tratan como no disponibles (no cambian nada)", () => {
  for (const x of [null, undefined, "x", 5, {}, { valid: "yes" }, { error: "forbidden" }]) assert.equal(parseLicenseResponse(x).status, "unavailable");
});
