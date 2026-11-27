import test from "node:test";
import assert from "node:assert/strict";
import { missingForPublish, parseMissing } from "../src/lib/event-publish.ts";

test("un evento completo no le falta nada", () => {
  assert.deepEqual(missingForPublish({ city: "Guadalajara", venue: "Lienzo", categories: 1 }), []);
});
test("un borrador subido desde la app (ciudad vacía) lista lo que falta; el cupo ya no se exige", () => {
  assert.deepEqual(missingForPublish({ city: "", venue: "Lienzo", categories: 1 }), ["city"]);
});
test("espacios cuentan como vacío, y sin categorías también", () => {
  assert.deepEqual(missingForPublish({ city: "  ", venue: " ", categories: 0 }), ["city", "venue", "categories"]);
});
test("parseMissing ignora lo desconocido y lo que no es texto", () => {
  assert.deepEqual(parseMissing("city,hack,capacity,venue"), ["city", "venue"]);
  assert.deepEqual(parseMissing(undefined), []);
  assert.deepEqual(parseMissing(["city"]), []);
});
