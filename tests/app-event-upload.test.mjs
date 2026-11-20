import test from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_VERSION, MAX_BYTES, buildUploadEventResponse, dbFailure, parseUploadEventBody, slugFrom } from "../src/lib/app-event-upload.ts";

const EVENT = "a9000000-0000-0000-0000-0000000000a1";
const SERIES = "a9000000-0000-0000-0000-0000000000b1";
const suffix = () => "abcd";
const base = () => ({
  contract_version: 1,
  event: { app_id: EVENT, name: "Lazada de Año Nuevo", date: "2026-12-31", venue: "Lienzo Charro", disciplines: ["lazo"], draw_type: "lazada_sorteada", lazada_shots_per_package: 4, rounds: 4, max_roper_rating: 6.5, max_team_rating: 12, entry_fee_cents: 50000 },
  series: { app_id: SERIES, name: "Temporada 2026", start_date: "2026-01-01", end_date: "2026-12-31" },
});
const parse = (body) => parseUploadEventBody(JSON.stringify(body), suffix);
const fails = (body, status, code) => { const r = parse(body); assert.equal(r.ok, false); assert.equal(r.status, status); assert.equal(r.code, code); };
const withEvent = (patch) => { const b = base(); Object.assign(b.event, patch); return b; };

test("un cuerpo completo se lee y arma los enlaces con el sufijo", () => {
  const r = parse(base());
  assert.equal(r.ok, true);
  assert.equal(r.event.slug, "lazada-de-ano-nuevo-abcd");
  assert.equal(r.series.slug, "temporada-2026-abcd");
  assert.equal(r.event.shots, 4);
  assert.deepEqual(r.event.disciplines, ["lazo"]);
});

test("el evento suelto (series null o ausente) es válido", () => {
  const a = base(); a.series = null; assert.equal(parse(a).series, null);
  const b = base(); delete b.series; assert.equal(parse(b).series, null);
});

test("round_robin sin topes ni cuota ni tiros", () => {
  const r = parse(withEvent({ draw_type: "round_robin", lazada_shots_per_package: null, max_roper_rating: null, max_team_rating: null, entry_fee_cents: undefined }));
  assert.equal(r.ok, true);
  assert.equal(r.event.shots, null);
  assert.equal(r.event.entry_fee_cents, 0);
});

test("rondas: opcionales, entero de 1 a 20", () => {
  assert.equal(parse(base()).event.rounds, 4);
  assert.equal(parse(withEvent({ rounds: undefined })).event.rounds, null);
  assert.equal(parse(withEvent({ rounds: null })).event.rounds, null);
  for (const bad of [0, 21, 2.5, "3", -1]) fails(withEvent({ rounds: bad }), 400, "invalid_field");
});

test("los tiros por paquete solo existen en lazada_sorteada", () => {
  fails(withEvent({ draw_type: "round_robin", lazada_shots_per_package: 3 }), 400, "invalid_field");
  fails(withEvent({ lazada_shots_per_package: 0 }), 400, "invalid_field");
  fails(withEvent({ lazada_shots_per_package: 1000 }), 400, "invalid_field");
  fails(withEvent({ lazada_shots_per_package: 2.5 }), 400, "invalid_field");
});

test("tipo de sorteo, modalidad, fecha, nombre y uuid inválidos", () => {
  fails(withEvent({ draw_type: "cyclic" }), 400, "invalid_field");
  fails(withEvent({ disciplines: ["barriles"] }), 400, "invalid_field");
  fails(withEvent({ disciplines: [] }), 400, "invalid_field");
  fails(withEvent({ date: "2026-02-30" }), 400, "invalid_field");
  fails(withEvent({ date: "31/12/2026" }), 400, "invalid_field");
  fails(withEvent({ name: "   " }), 400, "invalid_field");
  fails(withEvent({ app_id: "no-es-uuid" }), 400, "invalid_field");
});

test("topes de rating y cuota", () => {
  fails(withEvent({ max_roper_rating: 10.5 }), 400, "invalid_field");
  fails(withEvent({ max_team_rating: 21 }), 400, "invalid_field");
  fails(withEvent({ max_team_rating: -1 }), 400, "invalid_field");
  fails(withEvent({ entry_fee_cents: -5 }), 400, "invalid_field");
  fails(withEvent({ entry_fee_cents: 10.5 }), 400, "invalid_field");
  assert.equal(parse(withEvent({ max_team_rating: 12.34 })).event.max_team_rating, 12.3);
});

test("serie inválida: id, nombre y fechas", () => {
  const bad = (patch) => { const b = base(); Object.assign(b.series, patch); fails(b, 400, "invalid_field"); };
  bad({ app_id: "x" }); bad({ name: "A" }); bad({ start_date: "2026-12-31", end_date: "2026-01-01" }); bad({ end_date: "mañana" });
});

test("series.id (id de la web) es opcional y debe ser UUID", () => {
  assert.equal(parse(base()).series.id, null);
  const ok = base(); ok.series.id = "5e000000-0000-0000-0000-0000000000F1"; assert.equal(parse(ok).series.id, "5e000000-0000-0000-0000-0000000000f1");
  const bad = base(); bad.series.id = "x"; fails(bad, 400, "invalid_field");
  assert.equal(dbFailure("series_not_found").code, "series_not_found");
});

test("versión del contrato y forma del cuerpo", () => {
  fails({ ...base(), contract_version: 2 }, 426, "version_unsupported");
  const noVersion = base(); delete noVersion.contract_version; fails(noVersion, 400, "invalid_body");
  const noEvent = base(); delete noEvent.event; fails(noEvent, 400, "invalid_body");
  assert.equal(parseUploadEventBody("{", suffix).code, "invalid_json");
  assert.equal(parseUploadEventBody("[]", suffix).code, "invalid_body");
  const huge = parseUploadEventBody(JSON.stringify({ ...base(), pad: "x".repeat(MAX_BYTES) }), suffix);
  assert.equal(huge.status, 413);
});

test("el enlace no lleva acentos ni símbolos y siempre tiene forma válida para la base", () => {
  assert.equal(slugFrom("¡Año Nuevo, Ñandú!", "q1w2", "evento"), "ano-nuevo-nandu-q1w2");
  assert.match(slugFrom("???", "q1w2", "evento"), /^evento-q1w2$/);
  assert.match(slugFrom("a".repeat(200), "q1w2", "evento"), /^[a-z0-9-]{3,60}$/);
});

test("la respuesta sale con el contrato y el evento siempre como borrador", () => {
  const created = buildUploadEventResponse({ r_event_id: "e1", r_event_slug: "s", r_event_created: true, r_series_id: "s1", r_series_slug: "ss", r_series_created: false });
  assert.deepEqual(created, { contract_version: CONTRACT_VERSION, created: true, event: { id: "e1", slug: "s", status: "borrador" }, series: { id: "s1", slug: "ss", created: false } });
  assert.equal(buildUploadEventResponse({ r_event_id: "e1", r_event_slug: "s", r_event_created: false, r_series_id: null, r_series_slug: null, r_series_created: false }).series, null);
});

test("errores de la base que son de datos y no del servidor", () => {
  assert.equal(dbFailure("outside_series").code, "outside_series");
  assert.equal(dbFailure("series_full").status, 422);
  assert.equal(dbFailure("duplicate key value violates unique constraint \"events_slug_key\"").code, "slug_taken");
  assert.equal(dbFailure("connection refused"), null);
});

test("el ejemplo versionado del contrato (cuerpo y respuesta) cumple el contrato", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const read = (name) => readFileSync(fileURLToPath(new URL(`../docs/sync-examples/${name}`, import.meta.url)), "utf8");
  const parsed = parseUploadEventBody(read("evento-subida.request.json"), suffix);
  assert.equal(parsed.ok, true, parsed.error);
  const response = JSON.parse(read("evento-subida.response.json"));
  assert.deepEqual(Object.keys(buildUploadEventResponse({ r_event_id: response.event.id, r_event_slug: response.event.slug, r_event_created: true, r_series_id: response.series.id, r_series_slug: response.series.slug, r_series_created: true })), Object.keys(response));
  assert.equal(response.event.status, "borrador");
});
