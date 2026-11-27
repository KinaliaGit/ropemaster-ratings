import test from "node:test";
import assert from "node:assert/strict";
import { applicableTeamLimit, teamLimitApplies } from "../src/lib/rating-limits.ts";

test("el rating por equipo solo aplica a Lazada Sorteada", () => {
  assert.equal(teamLimitApplies("lazada_sorteada"), true);
  assert.equal(teamLimitApplies("round_robin"), false);
  assert.equal(teamLimitApplies(undefined), false);
  assert.equal(teamLimitApplies(null), false);
});

test("un tope por equipo guardado en Round Robin no aplica (null), aunque la base lo tenga", () => {
  assert.equal(applicableTeamLimit("round_robin", 11), null);
  assert.equal(applicableTeamLimit(undefined, 11), null);
});

test("en Lazada Sorteada el tope por equipo se conserva; sin tope sigue siendo null", () => {
  assert.equal(applicableTeamLimit("lazada_sorteada", 11), 11);
  assert.equal(applicableTeamLimit("lazada_sorteada", 0), 0);
  assert.equal(applicableTeamLimit("lazada_sorteada", null), null);
  assert.equal(applicableTeamLimit("lazada_sorteada", undefined), null);
});
