import test from "node:test";
import assert from "node:assert/strict";
import { dbErrorCode, missingBasics } from "../src/lib/event-required.ts";

const ok = { name: "Gran final", date: "2026-12-28", city: "Meoqui", venue: "Las fuentes", categories: 1, disciplines: 1 };

test("un evento con lo básico completo no tiene nada pendiente", () => {
  assert.deepEqual(missingBasics(ok), []);
});

test("cada dato obligatorio que falta tiene su propio código, todos juntos y en orden", () => {
  assert.deepEqual(missingBasics({ ...ok, name: "  " }), ["nameRequired"]);
  assert.deepEqual(missingBasics({ ...ok, date: "" }), ["dateInvalid"]);
  assert.deepEqual(missingBasics({ ...ok, date: "28/12/2026" }), ["dateInvalid"]);
  assert.deepEqual(missingBasics({ ...ok, city: "" }), ["arenaRequired"]);
  assert.deepEqual(missingBasics({ ...ok, venue: " " }), ["arenaRequired"]);
  assert.deepEqual(missingBasics({ ...ok, categories: 0 }), ["costRequired"]);
  assert.deepEqual(missingBasics({ ...ok, disciplines: 0 }), ["disciplineRequired"]);
  assert.deepEqual(missingBasics({ name: "", date: "", city: "", venue: "", categories: 0, disciplines: 0 }), ["nameRequired", "dateInvalid", "arenaRequired", "costRequired", "disciplineRequired"]);
});

test("una columna que falta en la base se reconoce como migraciones pendientes", () => {
  assert.equal(dbErrorCode({ code: "PGRST204", message: "Could not find the 'capacity_headers' column of 'events' in the schema cache" }), "schemaMissing");
  assert.equal(dbErrorCode({ code: "42703", message: 'column "short_go" of relation "events" does not exist' }), "schemaMissing");
  assert.equal(dbErrorCode({ message: "Could not find the 'event_time' column of 'events' in the schema cache" }), "schemaMissing");
});

test("cualquier otro error de la base es un fallo al guardar", () => {
  assert.equal(dbErrorCode({ code: "23505", message: "duplicate key value" }), "saveFailed");
  assert.equal(dbErrorCode({ code: "42501", message: "permission denied" }), "saveFailed");
  assert.equal(dbErrorCode(null), "saveFailed");
  assert.equal(dbErrorCode(undefined), "saveFailed");
});
