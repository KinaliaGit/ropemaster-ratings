import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_RESULTS_PAGE_SIZE, isUuid, parseEventResultsQuery, toEventResultsPage } from "../src/lib/event-results.ts";

const url = (query) => new URL(`https://ratings.example.com/api/eventos/x/resultados${query}`);
const ACTIVE = ["lazo"];
const row = (n, over = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, roper_id: null, name: `Persona ${n}`, avatar_path: null, time_ms: 12340, penalty_ms: null,
  disqualified: false, place: n, completed_runs: 3, nt_count: 0, dq_count: 0, has_rounds: true, pos: String(n), total: "75", ...over,
});

test("la petición exige una modalidad activa", () => {
  for (const query of ["", "?discipline=", "?discipline=barriles", "?discipline=hack", "?after=3"]) {
    assert.equal(parseEventResultsQuery(url(query), ACTIVE).ok, false, query);
  }
  assert.equal(parseEventResultsQuery(url("?discipline=lazo"), ACTIVE).ok, true);
});

test("after es un entero positivo; cualquier otra cosa se rechaza", () => {
  for (const after of ["0", "-1", "1.5", "abc", "1e3", "9999999999", "1;drop"]) {
    assert.equal(parseEventResultsQuery(url(`?discipline=lazo&after=${encodeURIComponent(after)}`), ACTIVE).ok, false, after);
  }
  const ok = parseEventResultsQuery(url("?discipline=lazo&after=30"), ACTIVE);
  assert.deepEqual(ok.ok && ok.value, { discipline: "lazo", after: 30 });
  const first = parseEventResultsQuery(url("?discipline=lazo&after="), ACTIVE);
  assert.deepEqual(first.ok && first.value, { discipline: "lazo", after: null });
});

test("isUuid acepta ids válidos y rechaza lo demás", () => {
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  for (const bad of ["", "x", null, undefined, 3, "11111111-1111-4111-8111-11111111111g"]) assert.equal(isUuid(bad), false);
});

test("una página con una fila de más indica que hay otra y apunta a la última posición entregada", () => {
  const page = toEventResultsPage(Array.from({ length: EVENT_RESULTS_PAGE_SIZE + 1 }, (_, i) => row(i + 1)), EVENT_RESULTS_PAGE_SIZE);
  assert.equal(page.rows.length, EVENT_RESULTS_PAGE_SIZE);
  assert.equal(page.next, EVENT_RESULTS_PAGE_SIZE);
  assert.equal(page.total, 75);
  assert.equal(page.rows[0].penaltyMs, 0, "sin castigo guardado queda en 0");
  assert.equal(page.rows[0].pos, 1);
});

test("la última página y una vacía no traen siguiente", () => {
  assert.equal(toEventResultsPage([row(31), row(32)], EVENT_RESULTS_PAGE_SIZE).next, null);
  assert.deepEqual(toEventResultsPage([], EVENT_RESULTS_PAGE_SIZE), { rows: [], next: null, total: 0 });
  assert.equal(toEventResultsPage(Array.from({ length: EVENT_RESULTS_PAGE_SIZE }, (_, i) => row(i + 1)), EVENT_RESULTS_PAGE_SIZE).next, null);
});

test("quien corrió sin lazador en la web conserva su nombre y no lleva enlace", () => {
  const guest = toEventResultsPage([row(1, { roper_id: null, name: "Chuy Invitado" })], EVENT_RESULTS_PAGE_SIZE).rows[0];
  assert.equal(guest.roperId, null);
  assert.equal(guest.name, "Chuy Invitado");
});

test("un descalificado conserva su marca y no trae lugar", () => {
  const dq = toEventResultsPage([row(1, { disqualified: true, place: null, time_ms: null })], EVENT_RESULTS_PAGE_SIZE).rows[0];
  assert.equal(dq.disqualified, true);
  assert.equal(dq.place, null);
  assert.equal(dq.timeMs, null);
});
