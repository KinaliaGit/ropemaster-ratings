import test from "node:test";
import assert from "node:assert/strict";
import { groupRoundItems } from "../src/lib/round-groups.ts";

const item = (group, title, shot, value) => ({ key: `${group}-${value}`, group, title, shot, tags: [], value, penalty: null, note: null });

test("los tiros de una misma ronda quedan juntos bajo el nombre de la ronda", () => {
  const groups = groupRoundItems([
    item("preliminary:1", "Ronda 1", "Tiro 1", "6.10"),
    item("preliminary:1", "Ronda 1", "Tiro 2", "6.40"),
    item("preliminary:1", "Ronda 1", "Tiro 3", "No time"),
    item("preliminary:2", "Ronda 2", "Tiro 1", "5.90"),
    item("preliminary:2", "Ronda 2", "Tiro 2", "6.00"),
  ]);
  assert.deepEqual(groups.map((g) => [g.title, g.items.length]), [["Ronda 1", 3], ["Ronda 2", 2]]);
  assert.deepEqual(groups[0].items.map((i) => i.shot), ["Tiro 1", "Tiro 2", "Tiro 3"]);
});

test("una ronda con un solo tiro sigue siendo un grupo de uno, sin etiqueta de tiro", () => {
  const groups = groupRoundItems([item("preliminary:1", "Ronda 1", null, "6.10"), item("final:1", "Ronda 1 · Final", null, "5.80")]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items[0].shot, null);
  assert.equal(groups[1].title, "Ronda 1 · Final");
});

test("sin rondas no hay grupos", () => {
  assert.deepEqual(groupRoundItems([]), []);
});
