import test from "node:test";
import assert from "node:assert/strict";
import { HISTORY_PAGE_SIZE, decodeHistoryCursor, encodeHistoryCursor, isUuid, toHistoryPage, toRounds, toSummary } from "../src/lib/results-history.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const row = (n, date = "2026-10-04") => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, event_name: `Evento ${n}`, event_slug: `evento-${n}`, event_date: date, event_verified: true,
  discipline: "lazo", time_ms: 12340, penalty_ms: null, disqualified: false, place: 2, completed_runs: 3, nt_count: 0, dq_count: 0, has_rounds: true,
});

test("el cursor sale y entra igual, y lo inválido se rechaza", () => {
  const c = { date: "2026-10-04", id: ID };
  assert.equal(encodeHistoryCursor(c), `2026-10-04~${ID}`);
  assert.deepEqual(decodeHistoryCursor(encodeHistoryCursor(c)), { ok: true, cursor: c });
  assert.deepEqual(decodeHistoryCursor(null), { ok: true, cursor: null });
  assert.deepEqual(decodeHistoryCursor(""), { ok: true, cursor: null });
  for (const bad of ["abc", "2026-10-04", `2026-13-40~${ID}`, `2026-02-30~${ID}`, `2026-10-04~x`, `2026-10-04~${ID}; drop`, `${ID}~2026-10-04`]) {
    assert.deepEqual(decodeHistoryCursor(bad), { ok: false }, bad);
  }
});

test("el id del cursor se normaliza a minúsculas", () => {
  const upper = ID.toUpperCase();
  assert.deepEqual(decodeHistoryCursor(`2026-10-04~${upper}`), { ok: true, cursor: { date: "2026-10-04", id: ID } });
  assert.equal(isUuid(upper), true);
  assert.equal(isUuid("no"), false);
});

test("una página con una fila de más indica que hay otra y el cursor apunta al último entregado", () => {
  const data = Array.from({ length: HISTORY_PAGE_SIZE + 1 }, (_, i) => row(i + 1, `2026-10-${String(30 - i).padStart(2, "0")}`));
  const page = toHistoryPage(data, HISTORY_PAGE_SIZE);
  assert.equal(page.rows.length, HISTORY_PAGE_SIZE);
  const last = page.rows[page.rows.length - 1];
  assert.equal(page.next, `${last.date}~${last.id}`);
  assert.equal(page.rows[0].penaltyMs, 0, "sin castigo guardado queda en 0");
  assert.equal(page.rows[0].hasRounds, true);
});

test("la última página y una vacía no traen siguiente", () => {
  assert.equal(toHistoryPage([row(1), row(2)], HISTORY_PAGE_SIZE).next, null);
  assert.deepEqual(toHistoryPage([], HISTORY_PAGE_SIZE), { rows: [], next: null });
  assert.equal(toHistoryPage(Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) => row(i + 1)), HISTORY_PAGE_SIZE).next, null);
});

test("la fecha llega como texto de día aunque la base la devuelva con hora", () => {
  assert.equal(toHistoryPage([row(1, "2026-10-04T00:00:00.000Z")], 20).rows[0].date, "2026-10-04");
});

test("el resumen de alguien sin resultados son ceros, no un error", () => {
  assert.deepEqual(toSummary(undefined), { results: 0, events: 0, wins: 0, bestPlace: null, bestRuns: {} });
  assert.deepEqual(toSummary({ results_count: 5, events_count: 4, wins: 1, best_place: 1, best_runs: { lazo: 5400 } }), { results: 5, events: 4, wins: 1, bestPlace: 1, bestRuns: { lazo: 5400 } });
});

test("las rondas se leen en su orden y con sus etiquetas", () => {
  const rounds = toRounds([
    { round: 1, stage: "preliminary", kind: "regular", status: "completed", time_ms: 6100, penalty_ms: 0 },
    { round: 2, stage: "preliminary", kind: "regular", status: "no_time", time_ms: null, penalty_ms: 0 },
    { round: 1, stage: "preliminary", kind: "extra", status: "completed", time_ms: 6500, penalty_ms: 500,
      substitution: { role: "heeler", substitute_name: "Chuy", substitute_global_id: null, counts_for_substitute: true } },
    { round: 1, stage: "tiebreak", kind: "regular", status: "disqualified", time_ms: null },
  ]);
  assert.equal(rounds.length, 4);
  assert.deepEqual(rounds[0], { round: 1, stage: "preliminary", kind: "regular", status: "completed", timeMs: 6100, penaltyMs: 0, substitution: null });
  assert.equal(rounds[1].status, "no_time");
  assert.equal(rounds[1].timeMs, null);
  assert.deepEqual(rounds[2].substitution, { role: "heeler", name: "Chuy", countsForSubstitute: true });
  assert.equal(rounds[3].stage, "tiebreak");
});

test("lo que no tiene la forma de una ronda se ignora en vez de romper la pantalla", () => {
  assert.deepEqual(toRounds(null), []);
  assert.deepEqual(toRounds({ round: 1 }), []);
  assert.deepEqual(toRounds([null, 3, "x", { round: "1" }, { round: 1, stage: "otra", kind: "regular", status: "completed" }]), []);
  assert.equal(toRounds([{ round: 1, stage: "final", kind: "regular", status: "completed", time_ms: 5000, substitution: { role: "x", substitute_name: "A" } }])[0].substitution, null);
});
