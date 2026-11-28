import test from "node:test";
import assert from "node:assert/strict";
import { otherSide, roleSwitchTarget } from "../src/lib/registration-role.ts";

const reg = (id, role, category = "Libre") => ({ id, role, category });
const room = (header, heeler) => ({ header, heeler });

test("el otro lado de cabecero es pialador y al revés", () => {
  assert.equal(otherSide("header"), "heeler");
  assert.equal(otherSide("heeler"), "header");
});

test("con las inscripciones abiertas y lugar en el otro lado, se ofrece pasar al otro rol", () => {
  const a = reg("a", "header");
  assert.equal(roleSwitchTarget(a, [a], room(true, true), true), "heeler");
  const b = reg("b", "heeler");
  assert.equal(roleSwitchTarget(b, [b], room(true, true), true), "header");
});

test("si el lado de destino está lleno no se ofrece, aunque el lado propio tenga lugar", () => {
  const a = reg("a", "header");
  assert.equal(roleSwitchTarget(a, [a], room(true, false), true), null);
  assert.equal(roleSwitchTarget(a, [a], room(false, true), true), "heeler", "que el lado propio esté lleno no importa: se libera al irse");
});

test("con las inscripciones cerradas (o evento no publicado) no se ofrece", () => {
  const a = reg("a", "header");
  assert.equal(roleSwitchTarget(a, [a], room(true, true), false), null);
});

test("quien se inscribió con los dos roles en la misma categoría no tiene a qué cambiar", () => {
  const h = reg("h", "header"), l = reg("l", "heeler");
  assert.equal(roleSwitchTarget(h, [h, l], room(true, true), true), null);
  assert.equal(roleSwitchTarget(l, [h, l], room(true, true), true), null);
});

test("con los dos roles pero en categorías distintas, cada inscripción sí puede cambiar", () => {
  const h = reg("h", "header", "Libre"), l = reg("l", "heeler", "Amateur");
  assert.equal(roleSwitchTarget(h, [h, l], room(true, true), true), "heeler");
  assert.equal(roleSwitchTarget(l, [h, l], room(true, true), true), "header");
});

test("otra inscripción de la misma categoría sin rol también bloquea (la base responde already)", () => {
  const a = reg("a", "header"), sinRol = reg("x", null);
  assert.equal(roleSwitchTarget(a, [a, sinRol], room(true, true), true), null);
});

test("una inscripción sin rol guardado no tiene «el otro rol»", () => {
  const a = reg("a", null);
  assert.equal(roleSwitchTarget(a, [a], room(true, true), true), null);
  assert.equal(roleSwitchTarget(reg("b", "ambos"), [reg("b", "ambos")], room(true, true), true), null);
});

test("sin dato de cupo (la consulta falló) se ofrece y la base decide", () => {
  const a = reg("a", "header");
  assert.equal(roleSwitchTarget(a, [a], undefined, true), "heeler");
});
