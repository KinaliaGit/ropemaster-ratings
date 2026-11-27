import test from "node:test";
import assert from "node:assert/strict";
import { parseCapacity, MAX_CAPACITY } from "../src/lib/event-capacity.ts";

test("un cupo vacío es sin límite (null)", () => {
  assert.equal(parseCapacity(""), null);
  assert.equal(parseCapacity("   "), null);
  assert.equal(parseCapacity(null), null);
  assert.equal(parseCapacity(undefined), null);
});

test("un entero mayor que 0 es un cupo válido", () => {
  assert.equal(parseCapacity("1"), 1);
  assert.equal(parseCapacity(" 60 "), 60);
  assert.equal(parseCapacity(String(MAX_CAPACITY)), MAX_CAPACITY);
});

test("cero, negativos, decimales, texto y cupos enormes no son válidos", () => {
  for (const bad of ["0", "-5", "1.5", "1,5", "abc", "12abc", String(MAX_CAPACITY + 1), "1e3"]) assert.equal(parseCapacity(bad), "invalid", bad);
});
