import test from "node:test";
import assert from "node:assert/strict";
import { fmtEnrolled, hasCapacityLimit, isFull, parseCapacity, parseCapacityFields, MAX_CAPACITY } from "../src/lib/event-capacity.ts";

const form = (fields) => (name) => fields[name];

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

test("sin interruptor (sin modo) no hay cupo: ni total ni por lado", () => {
  assert.deepEqual(parseCapacityFields(form({})), { ok: true, mode: "none", capacity: null, headers: null, heelers: null });
  assert.deepEqual(parseCapacityFields(form({ capacityMode: "none", capacity: "60" })), { ok: true, mode: "none", capacity: null, headers: null, heelers: null }); // un valor suelto no cuenta
});

test("igual por lado: el mismo cupo para cabeceros y pialadores, y el total es el doble", () => {
  assert.deepEqual(parseCapacityFields(form({ capacityMode: "eq", capacityEach: "30" })), { ok: true, mode: "eq", capacity: 60, headers: 30, heelers: 30 });
  for (const bad of ["", "0", "-1", "2.5", "x"]) assert.deepEqual(parseCapacityFields(form({ capacityMode: "eq", capacityEach: bad })), { ok: false, error: "capacityInvalid" }, bad);
});

test("por lado: cada lado por separado y el total es la suma; 0 en un lado es nadie de ese lado", () => {
  assert.deepEqual(parseCapacityFields(form({ capacityMode: "per", capacityHeaders: "35", capacityHeelers: "25" })), { ok: true, mode: "per", capacity: 60, headers: 35, heelers: 25 });
  assert.deepEqual(parseCapacityFields(form({ capacityMode: "per", capacityHeaders: "0", capacityHeelers: "10" })), { ok: true, mode: "per", capacity: 10, headers: 0, heelers: 10 });
});

test("por lado: hay que escribir los dos lados, enteros, y al menos uno mayor que 0", () => {
  for (const [h, l] of [["", "10"], ["10", ""], ["0", "0"], ["-1", "5"], ["2.5", "5"], ["a", "5"], [String(MAX_CAPACITY + 1), "5"]]) {
    assert.deepEqual(parseCapacityFields(form({ capacityMode: "per", capacityHeaders: h, capacityHeelers: l })), { ok: false, error: "capacitySidesInvalid" }, `${h}/${l}`);
  }
});

test("total (eventos que ya lo tenían así): un solo número, sin tope por lado", () => {
  assert.deepEqual(parseCapacityFields(form({ capacityMode: "total", capacity: "40" })), { ok: true, mode: "total", capacity: 40, headers: null, heelers: null });
  assert.deepEqual(parseCapacityFields(form({ capacityMode: "total", capacity: "" })), { ok: false, error: "capacityInvalid" });
});

test("un modo desconocido se rechaza", () => {
  assert.deepEqual(parseCapacityFields(form({ capacityMode: "hack" })), { ok: false, error: "capacityInvalid" });
});

test("un evento sin límite (cupo 0 en la capa de datos) nunca se llena y se muestra solo con los inscritos", () => {
  assert.equal(hasCapacityLimit(0), false);
  assert.equal(hasCapacityLimit(null), false);
  assert.equal(hasCapacityLimit(60), true);
  assert.equal(isFull(5, 0), false);
  assert.equal(isFull(0, 0), false);
  assert.equal(isFull(59, 60), false);
  assert.equal(isFull(60, 60), true);
  assert.equal(isFull(61, 60), true);
  assert.equal(fmtEnrolled(12, 0), "12");
  assert.equal(fmtEnrolled(12, 60), "12/60");
});
