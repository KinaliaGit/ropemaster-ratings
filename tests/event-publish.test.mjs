import test from "node:test";
import assert from "node:assert/strict";
import { missingForPublish, parseMissing } from "../src/lib/event-publish.ts";

test("un evento completo no le falta nada", () => {
  assert.deepEqual(missingForPublish({ city: "Guadalajara", venue: "Lienzo", capacity: 40, categories: 1 }), []);
});
test("un borrador subido desde la app (ciudad vacía, sin cupo) lista lo que falta", () => {
  assert.deepEqual(missingForPublish({ city: "", venue: "Lienzo", capacity: null, categories: 1 }), ["city", "capacity"]);
});
test("espacios cuentan como vacío; cupo 0 y sin categorías también", () => {
  assert.deepEqual(missingForPublish({ city: "  ", venue: " ", capacity: 0, categories: 0 }), ["city", "venue", "capacity", "categories"]);
});
test("parseMissing ignora lo desconocido y lo que no es texto", () => {
  assert.deepEqual(parseMissing("city,hack,capacity"), ["city", "capacity"]);
  assert.deepEqual(parseMissing(undefined), []);
  assert.deepEqual(parseMissing(["city"]), []);
});
