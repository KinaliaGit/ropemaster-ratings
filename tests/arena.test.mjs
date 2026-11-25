import test from "node:test";
import assert from "node:assert/strict";
import { arenaKey, cleanArenaName, collectArenas, parseArenaParam } from "../src/lib/arena.ts";

test("la llave ignora mayúsculas, acentos, signos y espacios repetidos", () => {
  assert.equal(arenaKey("Arena X"), "arena x");
  assert.equal(arenaKey("  ARENA   x. "), "arena x");
  assert.equal(arenaKey("Árbol Ñandú, S.A."), "arbol nandu s a");
  assert.equal(arenaKey("Lienzo Charro «Los Encinos»"), "lienzo charro los encinos");
});
test("sin lugar, o solo signos, la llave queda vacía", () => {
  assert.equal(arenaKey(""), "");
  assert.equal(arenaKey(null), "");
  assert.equal(arenaKey(" ... "), "");
});
test("cleanArenaName solo quita espacios sobrantes", () => {
  assert.equal(cleanArenaName("  Lienzo   Charro "), "Lienzo Charro");
});
test("collectArenas agrupa escrituras de la misma arena y muestra la más usada", () => {
  const out = collectArenas(["Arena Norte", "arena norte", "Arena Norte", "Lienzo Sur", "", null, "ARENA  NORTE."]);
  assert.deepEqual(out, [{ key: "arena norte", name: "Arena Norte", count: 4 }, { key: "lienzo sur", name: "Lienzo Sur", count: 1 }]);
});
test("si dos escrituras empatan gana la primera que apareció", () => {
  assert.equal(collectArenas(["lienzo sur", "Lienzo Sur"])[0].name, "lienzo sur");
});
test("el parámetro ?arena= solo acepta llaves válidas", () => {
  assert.equal(parseArenaParam("arena norte"), "arena norte");
  assert.equal(parseArenaParam(" lienzo "), "lienzo");
  assert.equal(parseArenaParam(undefined), "");
  assert.equal(parseArenaParam(["a", "b"]), "");
  assert.equal(parseArenaParam("Arena Norte"), "");
  assert.equal(parseArenaParam("../x?y=1"), "");
  assert.ok(parseArenaParam("x".repeat(300)).length <= 120); // se recorta; una llave tan larga no coincide con ninguna arena
});
