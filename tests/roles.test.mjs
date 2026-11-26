import test from "node:test";
import assert from "node:assert/strict";
import { canChangeRole, parseRoleChoice, roleFromRow, roleText } from "../src/lib/roles.ts";

const L = { header: "Cabecero", heeler: "Pialador", both: "Ambos", favorite: "favorito", undefined: "Sin definir" };

test("cabecero y pialador no llevan favorito (se ignora si llega)", () => {
  assert.deepEqual(parseRoleChoice("header", null), { role: "header", favorite: null });
  assert.deepEqual(parseRoleChoice("heeler", "header"), { role: "heeler", favorite: null });
});

test("'ambos' exige un favorito que sea cabecero o pialador", () => {
  assert.deepEqual(parseRoleChoice("both", "heeler"), { role: "both", favorite: "heeler" });
  assert.equal(parseRoleChoice("both", null), null);
  assert.equal(parseRoleChoice("both", ""), null);
  assert.equal(parseRoleChoice("both", "both"), null);
});

test("un rol vacío o inventado no es válido", () => {
  for (const bad of [null, undefined, "", "astronauta", 3]) assert.equal(parseRoleChoice(bad, "header"), null);
});

test("un perfil sin rol sale como sin definir", () => {
  assert.equal(roleFromRow(null, null), null);
  assert.deepEqual(roleFromRow("both", "header"), { role: "both", favorite: "header" });
  assert.equal(roleText(null, L), "Sin definir");
});

test("el texto del rol se ve claro", () => {
  assert.equal(roleText({ role: "header", favorite: null }, L), "Cabecero");
  assert.equal(roleText({ role: "heeler", favorite: null }, L), "Pialador");
  assert.equal(roleText({ role: "both", favorite: "heeler" }, L), "Ambos · favorito: Pialador");
});

test("KIN-746: con los dos roles en la misma categoría no se ofrece cambiar; en los demás casos sí", () => {
  const reg = (id, category, slug) => ({ id, category, event: { slug } });
  const header = reg("1", "Libre", "a"), heeler = reg("2", "Libre", "a"), otherCategory = reg("3", "Amateur", "a"), otherEvent = reg("4", "Libre", "b");
  const mine = [header, heeler, otherCategory, otherEvent];
  assert.equal(canChangeRole(header, mine), false);
  assert.equal(canChangeRole(heeler, mine), false);
  assert.equal(canChangeRole(otherCategory, mine), true);
  assert.equal(canChangeRole(otherEvent, mine), true);
});
