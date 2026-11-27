import test from "node:test";
import assert from "node:assert/strict";
import { formatRounds, parseRounds, parseShortGo, splitRounds } from "../src/lib/event-rounds.ts";

test("el short-go viaja como true o false; ausente es activo", () => {
  assert.equal(parseShortGo("true"), true);
  assert.equal(parseShortGo("false"), false);
  assert.equal(parseShortGo(undefined), true);
  assert.equal(parseShortGo(null), true);
});

test("el ejemplo del contrato: 3 rondas con short-go son 2 normales + 1 short-go, sin una cuarta ronda", () => {
  assert.deepEqual(parseRounds("3", "true"), { ok: true, rounds: 3, shortGo: true });
  assert.deepEqual(splitRounds(3, true), { regular: 2, shortGo: true });
  assert.equal(formatRounds(3, true, "rondas", "short-go"), "2 rondas + short-go");
  assert.deepEqual(splitRounds(3, false), { regular: 3, shortGo: false });
  assert.equal(formatRounds(3, false, "rondas", "short-go"), "3 rondas");
});

test("rondas vacías son sin definir y conservan el short-go elegido", () => {
  assert.deepEqual(parseRounds("", "true"), { ok: true, rounds: null, shortGo: true });
  assert.deepEqual(parseRounds("  ", "false"), { ok: true, rounds: null, shortGo: false });
  assert.deepEqual(parseRounds(undefined, undefined), { ok: true, rounds: null, shortGo: true });
  assert.equal(splitRounds(null, true), null);
  assert.equal(formatRounds(null, true, "rondas", "short-go"), "");
});

test("con short-go se necesitan al menos 2 rondas; sin short-go basta con 1", () => {
  assert.deepEqual(parseRounds("1", "true"), { ok: false, error: "shortGoMin" });
  assert.deepEqual(parseRounds("2", "true"), { ok: true, rounds: 2, shortGo: true });
  assert.deepEqual(parseRounds("1", "false"), { ok: true, rounds: 1, shortGo: false });
});

test("fuera de 1 a 10, decimales y texto son inválidos", () => {
  for (const bad of ["0", "11", "-1", "2.5", "abc", "3x"]) assert.deepEqual(parseRounds(bad, "false"), { ok: false, error: "invalidRounds" }, bad);
  assert.deepEqual(parseRounds("10", "true"), { ok: true, rounds: 10, shortGo: true });
});

test("un evento de una sola ronda no tiene short-go aparte, y un evento viejo sin short_go guardado se entiende con short-go", () => {
  assert.deepEqual(splitRounds(1, true), { regular: 1, shortGo: false });
  assert.deepEqual(splitRounds(4, undefined), { regular: 3, shortGo: true });
  assert.deepEqual(splitRounds(4, null), { regular: 3, shortGo: true });
});
