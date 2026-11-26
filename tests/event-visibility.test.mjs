import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, DEFAULT_VISIBILITY, EVENT_STATUSES, EVENT_VISIBILITIES, isPrivate, parseVisibility } from "../src/lib/event-visibility.ts";

test("KIN-769: los valores del contrato son los de la base", () => {
  assert.deepEqual([...EVENT_STATUSES], ["borrador", "publicado", "finalizado"]);
  assert.deepEqual([...EVENT_VISIBILITIES], ["publico", "privado"]);
  assert.equal(DEFAULT_VISIBILITY, "publico");
});

test("una visibilidad que no se reconoce es pública (el valor por defecto de todos los eventos)", () => {
  assert.equal(parseVisibility("privado"), "privado");
  assert.equal(parseVisibility("publico"), "publico");
  for (const raw of [undefined, null, "", "secreto", "PRIVADO", 1, {}]) assert.equal(parseVisibility(raw), "publico", String(raw));
  assert.equal(isPrivate({ visibility: "privado" }), true);
  assert.equal(isPrivate({ visibility: "publico" }), false);
  assert.equal(isPrivate({}), false);
});

test("transiciones del estado: borrador y publicado se alternan, publicado termina en finalizado y finalizado no regresa", () => {
  assert.equal(canTransition("borrador", "publicado"), true);
  assert.equal(canTransition("publicado", "borrador"), true);
  assert.equal(canTransition("publicado", "finalizado"), true);
  assert.equal(canTransition("borrador", "finalizado"), false, "un borrador no se finaliza");
  assert.equal(canTransition("finalizado", "publicado"), false);
  assert.equal(canTransition("finalizado", "borrador"), false);
  assert.equal(canTransition("publicado", "publicado"), false);
});
