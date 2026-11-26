import test from "node:test";
import assert from "node:assert/strict";
import { findTeams, progressPct } from "../src/lib/live.ts";
import { demoSnapshot } from "../src/lib/live-demo.ts";
import { matchesName } from "../src/lib/search.ts";

test("KIN-558: el avance va de 0 a 100 y aguanta una ronda sin equipos", () => {
  assert.equal(progressPct(24, 60), 40);
  assert.equal(progressPct(0, 0), 0);
  assert.equal(progressPct(70, 60), 100);
});

test("buscar un nombre muestra todos sus turnos en orden, y cuánto falta para cada uno", () => {
  const t = (n, header, heeler) => ({ n, header, heeler, totalMs: 9000 + n });
  const s = { current: t(3, "Julián Pérez", "Mario Ruiz"), pending: [t(4, "Luis Soto", "Raúl Díaz"), t(5, "Ana Ruiz", "Sergio Ríos")], standings: [t(2, "Diego Mora", "Fabián Gil"), t(1, "Ana Ruiz", "Pablo Paz")] };
  assert.deepEqual(findTeams(s, "ruiz", matchesName).map((m) => [m.team.n, m.state, m.ahead ?? m.place]), [[1, "placed", 2], [3, "current", undefined], [5, "pending", 2]]);
  assert.deepEqual(findTeams(s, "diaz", matchesName).map((m) => [m.team.n, m.ahead]), [[4, 1]]);
  assert.deepEqual(findTeams(s, "  ", matchesName), []);
  assert.deepEqual(findTeams(s, "zzzz", matchesName), []);
});

test("escribiendo solo un número se busca ese turno, no un nombre", () => {
  const s = demoSnapshot(24, 0);
  assert.deepEqual(findTeams(s, "78", matchesName).map((m) => [m.team.n, m.state, m.ahead]), [[78, "pending", 53]]);
  assert.deepEqual(findTeams(s, "999", matchesName), []);
});

test("el ejemplo avanza de forma coherente, desde antes de empezar hasta terminar la ronda", () => {
  const start = demoSnapshot(0, 0);
  assert.equal(start.standings.length, 0);
  assert.equal(start.current.n, 1);
  const end = demoSnapshot(start.total, 0);
  assert.ok(end.standings.every((x) => x.header !== x.heeler));
  assert.ok(findTeams(end, end.standings[0].header, matchesName).length >= 2); // en el ejemplo la gente tiene varios turnos
});
