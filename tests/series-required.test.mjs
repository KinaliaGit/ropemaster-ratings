import test from "node:test";
import assert from "node:assert/strict";
import { missingSeriesBasics } from "../src/lib/series-required.ts";

const ok = { name: "Las 9 arenas", startDate: "2027-01-26", endDate: "2027-11-26", city: "Meoqui", venue: "Las fuentes", categories: 1 };

test("una serie con lo básico completo no tiene nada pendiente", () => {
  assert.deepEqual(missingSeriesBasics(ok), []);
});

test("cada dato obligatorio que falta o está mal tiene su código", () => {
  assert.deepEqual(missingSeriesBasics({ ...ok, name: " a " }), ["seriesNameRequired"]);
  assert.deepEqual(missingSeriesBasics({ ...ok, startDate: "" }), ["seriesDatesInvalid"]);
  assert.deepEqual(missingSeriesBasics({ ...ok, endDate: "26/11/2027" }), ["seriesDatesInvalid"]);
  assert.deepEqual(missingSeriesBasics({ ...ok, city: "" }), ["arenaRequired"]);
  assert.deepEqual(missingSeriesBasics({ ...ok, venue: " " }), ["arenaRequired"]);
  assert.deepEqual(missingSeriesBasics({ ...ok, categories: 0 }), ["costRequired"]);
});

test("terminar antes de empezar es un error propio (solo si las dos fechas son válidas)", () => {
  assert.deepEqual(missingSeriesBasics({ ...ok, startDate: "2027-12-01", endDate: "2027-01-01" }), ["range"]);
  assert.deepEqual(missingSeriesBasics({ ...ok, startDate: "2027-01-01", endDate: "2027-01-01" }), []); // el mismo día vale
  assert.deepEqual(missingSeriesBasics({ ...ok, startDate: "", endDate: "2020-01-01" }), ["seriesDatesInvalid"]);
});

test("todo junto y en el orden del formulario", () => {
  assert.deepEqual(missingSeriesBasics({ name: "", startDate: "", endDate: "", city: "", venue: "", categories: 0 }), ["seriesNameRequired", "seriesDatesInvalid", "arenaRequired", "costRequired"]);
});
