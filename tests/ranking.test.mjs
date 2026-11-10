import test from "node:test";
import assert from "node:assert/strict";
import { MAX_QUERY_LENGTH, MAX_TOKENS, RANKING_PAGE_SIZE, parseRankingQuery, rankedToRoper, searchTokens, toRankingPage } from "../src/lib/ranking.ts";

const url = (query) => new URL(`https://ratings.example.com/api/ranking${query}`);
const ACTIVE = ["lazo"];
const row = (n) => ({ roper_id: `id-${n}`, full_name: `Persona ${n}`, avatar_path: null, rating: "9.40", events_count: 3, wins: 1, is_initial: false, rank: String(n) });

test("la búsqueda se parte en palabras sin acentos ni mayúsculas, sin repetir y con un máximo", () => {
  assert.deepEqual(searchTokens("  Ánä   EstRada "), ["ana", "estrada"]);
  assert.deepEqual(searchTokens("ana ana ANA"), ["ana"]);
  assert.deepEqual(searchTokens("a b c d e f g"), ["a", "b", "c", "d", "e"]);
  assert.equal(searchTokens("a b c d e f g").length, MAX_TOKENS);
  assert.deepEqual(searchTokens("   "), []);
  assert.deepEqual(searchTokens("x".repeat(MAX_QUERY_LENGTH + 40)), ["x".repeat(MAX_QUERY_LENGTH)]);
});

test("la petición exige una modalidad activa", () => {
  for (const query of ["", "?discipline=", "?discipline=barriles", "?discipline=hack", "?q=ana"]) {
    assert.equal(parseRankingQuery(url(query), ACTIVE).ok, false, query);
  }
  assert.equal(parseRankingQuery(url("?discipline=lazo"), ACTIVE).ok, true);
});

test("after es un entero positivo; cualquier otra cosa se rechaza", () => {
  for (const after of ["0", "-1", "1.5", "abc", "1e3", "9999999999", "1;drop"]) {
    assert.equal(parseRankingQuery(url(`?discipline=lazo&after=${encodeURIComponent(after)}`), ACTIVE).ok, false, after);
  }
  const ok = parseRankingQuery(url("?discipline=lazo&after=50&q=Ana%20Es"), ACTIVE);
  assert.deepEqual(ok.ok && ok.value, { discipline: "lazo", tokens: ["ana", "es"], after: 50 });
  const first = parseRankingQuery(url("?discipline=lazo&after="), ACTIVE);
  assert.deepEqual(first.ok && first.value, { discipline: "lazo", tokens: [], after: null });
});

test("una página con una fila de más indica que hay otra y apunta al último lugar entregado", () => {
  const data = Array.from({ length: RANKING_PAGE_SIZE + 1 }, (_, i) => row(i + 1));
  const page = toRankingPage(data, RANKING_PAGE_SIZE);
  assert.equal(page.rows.length, RANKING_PAGE_SIZE);
  assert.equal(page.next, RANKING_PAGE_SIZE);
  assert.equal(page.rows[0].rating, 9.4);
  assert.equal(page.rows[0].rank, 1);
});

test("la última página no trae siguiente, y una vacía tampoco", () => {
  assert.equal(toRankingPage([row(51), row(52)], RANKING_PAGE_SIZE).next, null);
  assert.deepEqual(toRankingPage([], RANKING_PAGE_SIZE), { rows: [], next: null });
  assert.equal(toRankingPage(Array.from({ length: RANKING_PAGE_SIZE }, (_, i) => row(i + 1)), RANKING_PAGE_SIZE).next, null);
});

test("una fila del ranking se convierte en participante con su rating de esa modalidad", () => {
  const roper = rankedToRoper({ id: "a", name: "Ana", avatarPath: null, rating: 1, events: 0, wins: 0, initial: true, rank: 7 }, "lazo");
  assert.deepEqual(roper, { id: "a", name: "Ana", avatarPath: null, stats: { lazo: { rating: 1, events: 0, wins: 0, initial: true } } });
});
