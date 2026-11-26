import test from "node:test";
import assert from "node:assert/strict";
import { badgeText, bellState } from "../src/lib/bell.ts";

test("el circulito de la campana muestra el número y «9+» desde 10", () => {
  assert.equal(badgeText(1), "1");
  assert.equal(badgeText(9), "9");
  assert.equal(badgeText(10), "9+");
  assert.equal(badgeText(120), "9+");
});

test("al marcar como leído desde el menú, los sin ver bajan al momento y nunca quedan en negativo", () => {
  assert.deepEqual(bellState({ unread: 3, total: 3, shown: 3, markedHere: 0 }), { unread: 3, hasMore: false });
  assert.equal(bellState({ unread: 3, total: 3, shown: 3, markedHere: 1 }).unread, 2);
  assert.equal(bellState({ unread: 3, total: 3, shown: 3, markedHere: 3 }).unread, 0);
  assert.equal(bellState({ unread: 1, total: 3, shown: 3, markedHere: 4 }).unread, 0);
});

test("«ver todos» sale solo cuando hay más avisos de los que caben en el menú", () => {
  assert.equal(bellState({ unread: 0, total: 5, shown: 5, markedHere: 0 }).hasMore, false);
  assert.equal(bellState({ unread: 0, total: 6, shown: 5, markedHere: 0 }).hasMore, true);
  assert.equal(bellState({ unread: 0, total: 0, shown: 0, markedHere: 0 }).hasMore, false);
});
