import test from "node:test";
import assert from "node:assert/strict";
import { moveToFront } from "../src/lib/photo-drafts.ts";

const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("hacer portada pone la foto al principio y conserva el orden de las demás", () => {
  assert.deepEqual(moveToFront(list, "c").map((p) => p.id), ["c", "a", "b"]);
  assert.deepEqual(moveToFront(list, "b").map((p) => p.id), ["b", "a", "c"]);
});

test("si ya es la primera, o el id no existe, no cambia nada", () => {
  assert.deepEqual(moveToFront(list, "a").map((p) => p.id), ["a", "b", "c"]);
  assert.deepEqual(moveToFront(list, "zzz").map((p) => p.id), ["a", "b", "c"]);
});

test("no modifica la lista original", () => {
  const before = JSON.stringify(list);
  moveToFront(list, "c");
  assert.equal(JSON.stringify(list), before);
});
