import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_VERSION, etagMatches, isPublishingLive, liveEtag, liveResponse, parseLiveBody, toLiveSnapshot } from "../src/lib/app-live.ts";

const team = (n, extra = {}) => ({ n, header: `Cabecero ${n}`, heeler: `Pialador ${n}`, total_ms: null, ...extra });
const body = (over = {}) => JSON.stringify({
  contract_version: CONTRACT_VERSION, revision: 7, round: 2, rounds: 3, total: 4, done: 2,
  current: team(3), pending: [team(4)], standings: [team(1, { total_ms: 8200 }), team(2, { total_ms: 9100 })], ...over,
});

test("KIN-787: short_go solo se guarda cuando es verdadero y debe ser booleano", () => {
  assert.equal(parseLiveBody(body({ short_go: true })).snapshot.shortGo, true);
  assert.equal("shortGo" in parseLiveBody(body({ short_go: false })).snapshot, false);
  assert.equal("shortGo" in parseLiveBody(body()).snapshot, false, "una app anterior no lo manda");
  assert.equal(parseLiveBody(body({ short_go: "si" })).ok, false);
});

test("KIN-787: una foto completa se acepta y se guarda sin el nombre del evento", () => {
  const r = parseLiveBody(body());
  assert.equal(r.ok, true);
  assert.equal(r.revision, 7);
  assert.deepEqual(r.snapshot.current, { n: 3, header: "Cabecero 3", heeler: "Pialador 3", totalMs: null });
  assert.equal(r.snapshot.standings[0].totalMs, 8200);
  assert.equal("name" in r.snapshot, false);
});

test("antes de empezar y al terminar la ronda no hay equipo en turno", () => {
  assert.equal(parseLiveBody(body({ current: null, done: 0, standings: [], pending: [team(1), team(2), team(3), team(4)] })).snapshot.current, null);
  assert.equal(parseLiveBody(body({ current: undefined, done: 4, pending: [] })).snapshot.current, null);
});

test("los nombres se limpian y no se acepta nada sin nombre", () => {
  const ok = parseLiveBody(body({ current: team(3, { header: "  Ana\n\tPérez  " }) }));
  assert.equal(ok.snapshot.current.header, "Ana Pérez");
  assert.equal(parseLiveBody(body({ current: team(3, { header: "   " }) })).code, "invalid_field");
  assert.equal(parseLiveBody(body({ current: team(3, { heeler: 5 }) })).code, "invalid_field");
});

test("se rechaza lo que no es una foto válida, con el motivo", () => {
  assert.equal(parseLiveBody("no es json").code, "invalid_json");
  assert.equal(parseLiveBody("[]").code, "invalid_body");
  assert.equal(parseLiveBody(JSON.stringify({ revision: 1 })).code, "invalid_body");
  assert.equal(parseLiveBody(body({ contract_version: 99 })).status, 426);
  for (const bad of [{ revision: 0 }, { revision: 1.5 }, { rounds: 0 }, { round: 4 }, { total: -1 }, { done: 5 }, { pending: "x" }, { standings: [1] }]) {
    assert.equal(parseLiveBody(body(bad)).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseLiveBody(body({ standings: [team(1, { total_ms: -5 })] })).code, "invalid_field");
});

test("el tamaño está acotado", () => {
  assert.equal(parseLiveBody(body({ pending: Array.from({ length: 1001 }, (_, i) => team(i + 1)) })).status, 413);
  assert.equal(parseLiveBody("x".repeat(300 * 1024)).status, 413);
});

test("90 equipos caben de sobra", () => {
  const r = parseLiveBody(body({ total: 90, done: 24, pending: Array.from({ length: 65 }, (_, i) => team(26 + i)), standings: Array.from({ length: 24 }, (_, i) => team(i + 1, { total_ms: 8000 + i })) }));
  assert.equal(r.ok, true);
});

test("la respuesta de guardar distingue nueva, repetida, vieja y ajena", () => {
  assert.deepEqual(liveResponse("stored", "e1", 7), { status: 200, body: { contract_version: 1, event_id: "e1", revision: 7, unchanged: false } });
  assert.equal(liveResponse("unchanged", "e1", 7).body.unchanged, true);
  const stale = liveResponse("stale", "e1", 9);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "stale_revision");
  assert.equal(stale.body.revision, 9);
  assert.equal(liveResponse("not_found", "e1", null).status, 404);
});

test("la lectura pública agrega el nombre y la arena reales del evento", () => {
  const s = toLiveSnapshot({ revision: "7", snapshot: parseLiveBody(body()).snapshot, updated_at: "2026-11-27T03:00:00Z", event_name: "Lienzo de prueba", venue: "Arena Uno", city: "Monterrey" });
  assert.equal(s.name, "Lienzo de prueba");
  assert.equal(s.venue, "Arena Uno, Monterrey");
  assert.equal(s.updatedAt, "2026-11-27T03:00:00Z");
  assert.equal(toLiveSnapshot({ revision: 1, snapshot: s, updated_at: "x", event_name: "A", venue: null, city: null }).venue, "");
});

test("el ETag es la revisión y el navegador lo reconoce solo si no cambió", () => {
  assert.equal(liveEtag(7), '"live-7"');
  assert.equal(etagMatches('"live-7"', liveEtag(7)), true);
  assert.equal(etagMatches('W/"live-7", "otro"', liveEtag(7)), true);
  assert.equal(etagMatches("*", liveEtag(7)), true);
  assert.equal(etagMatches('"live-6"', liveEtag(7)), false);
  assert.equal(etagMatches(null, liveEtag(7)), false);
});

test("KIN-787: la ficha del evento muestra «ver resultados en vivo» solo si la app ya publicó una foto", () => {
  assert.equal(isPublishingLive([{ revision: 3, snapshot: {} }]), true);
  assert.equal(isPublishingLive([]), false, "sin foto: el evento aún no empieza");
  assert.equal(isPublishingLive(null), false);
  assert.equal(isPublishingLive(undefined), false);
});

const run = (n, extra = {}) => ({ n, header: `Cabecero ${n}`, heeler: `Pialador ${n}`, time_ms: 8200, status: "ok", ...extra });

test("KIN-787: el último tiempo y los tiempos de cada ronda son opcionales y se guardan limpios", () => {
  const plain = parseLiveBody(body());
  assert.equal("last" in plain.snapshot, false, "una app anterior no los manda");
  assert.equal("results" in plain.snapshot, false);
  const ok = parseLiveBody(body({
    last: { ...run(2), round: 2, total_ms: 16400 },
    results: [{ round: 1, short_go: false, runs: [run(1), run(2, { time_ms: null, status: "no_time" })] }, { round: 3, short_go: true, runs: [run(1, { status: "dq", time_ms: null })] }],
  }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.snapshot.last, { n: 2, header: "Cabecero 2", heeler: "Pialador 2", timeMs: 8200, status: "ok", round: 2, totalMs: 16400 });
  assert.equal(ok.snapshot.results.length, 2);
  assert.deepEqual(ok.snapshot.results[0].runs[1], { n: 2, header: "Cabecero 2", heeler: "Pialador 2", timeMs: null, status: "no_time" });
  assert.equal(ok.snapshot.results[1].shortGo, true);
  assert.equal("shortGo" in ok.snapshot.results[0], false, "short_go solo se guarda cuando es verdadero");
});

test("KIN-787: se rechazan tiempos mal formados", () => {
  assert.equal(parseLiveBody(body({ last: { ...run(1), round: 0 } })).ok, false, "ronda inválida");
  assert.equal(parseLiveBody(body({ last: { ...run(1), round: 1, status: "raro" } })).ok, false, "estado desconocido");
  assert.equal(parseLiveBody(body({ results: "x" })).ok, false);
  assert.equal(parseLiveBody(body({ results: [{ round: 1, runs: "x" }] })).ok, false);
  assert.equal(parseLiveBody(body({ results: [{ round: 1, runs: [run(1, { time_ms: -5 })] }] })).ok, false, "tiempo negativo");
  assert.equal(parseLiveBody(body({ results: [{ round: 1, runs: [run(1, { header: "" })] }] })).ok, false, "sin nombre");
});
