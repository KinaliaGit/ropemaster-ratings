import test from "node:test";
import assert from "node:assert/strict";
import { parseRatingInput } from "../src/lib/rating-input.ts";

test("acepta de 1 a 10 con un decimal, con punto o con coma", () => {
  assert.equal(parseRatingInput("1"), 1);
  assert.equal(parseRatingInput("4.5"), 4.5);
  assert.equal(parseRatingInput("4,5"), 4.5);
  assert.equal(parseRatingInput(" 7 "), 7);
  assert.equal(parseRatingInput("10"), 10);
  assert.equal(parseRatingInput("10.0"), 10);
  assert.equal(parseRatingInput(6.5), 6.5);
});

test("rechaza lo que no es un rating válido", () => {
  for (const bad of ["", "   ", "0", "0.9", "10.5", "11", "4.55", "-3", "abc", "4.", ".5", "1e1", null, undefined, {}, NaN]) {
    assert.equal(parseRatingInput(bad), null, `debería rechazar ${String(bad)}`);
  }
});
