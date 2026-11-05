import test from "node:test";
import assert from "node:assert/strict";
import {
  PAGE_SIZE, buildPage, buildRatings, decodeCursor, encodeCursor, isOrganizerActive, parseIso, parseParticipantsQuery,
} from "../src/lib/app-participants.ts";

const EVENT = "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0";
const PERSON = "11111111-1111-4111-8111-111111111111";
const url = (query) => new URL(`https://ratings.example.com/api/app/participantes${query}`);

test("event_id es obligatorio: nunca hay un modo de pedir todo el directorio", () => {
  for (const query of ["", "?since=2026-11-05T10:00:00Z", "?event_id=", "?event_id=%20%20", "?cursor=abc"]) {
    const result = parseParticipantsQuery(url(query));
    assert.equal(result.ok, false, `debe rechazar ${query || "(sin parámetros)"}`);
    assert.match(result.error, /event_id/);
  }
});

test("event_id debe ser un uuid; se normaliza a minúsculas", () => {
  assert.equal(parseParticipantsQuery(url("?event_id=no-es-uuid")).ok, false);
  assert.equal(parseParticipantsQuery(url("?event_id=1%3B%20drop%20table")).ok, false);
  const ok = parseParticipantsQuery(url(`?event_id=${EVENT.toUpperCase()}`));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { eventId: EVENT, since: null, cursor: null });
});

test("since acepta fechas ISO con hora y las normaliza a UTC; rechaza lo demás", () => {
  assert.equal(parseIso("2026-11-05T10:00:00Z"), "2026-11-05T10:00:00.000Z");
  assert.equal(parseIso("2026-11-05T04:00:00-06:00"), "2026-11-05T10:00:00.000Z");
  assert.equal(parseIso("2026-11-05T10:00:00.123456+00:00"), "2026-11-05T10:00:00.123Z");
  for (const bad of ["", "ayer", "2026-11-05", "2026-13-45T10:00:00Z", "2026-11-05 10:00:00"]) assert.equal(parseIso(bad), null, bad);
  const ok = parseParticipantsQuery(url(`?event_id=${EVENT}&since=2026-11-05T10:00:00Z`));
  assert.equal(ok.value.since, "2026-11-05T10:00:00.000Z");
  assert.equal(parseParticipantsQuery(url(`?event_id=${EVENT}&since=ayer`)).ok, false);
});

test("el cursor va y viene sin perder nada, y uno inventado se rechaza", () => {
  const cursor = { changedAt: "2026-11-02T10:00:00.123456+00:00", id: PERSON, snapshot: "2026-11-05T10:00:00.000Z" };
  const raw = encodeCursor(cursor);
  assert.match(raw, /^[A-Za-z0-9_-]+$/, "es seguro para una URL");
  assert.deepEqual(decodeCursor(raw), cursor);
  const parsed = parseParticipantsQuery(url(`?event_id=${EVENT}&cursor=${raw}`));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.cursor, cursor);

  for (const bad of ["", "no-es-base64!", Buffer.from("{}").toString("base64url"), Buffer.from("[1,2]").toString("base64url"),
    Buffer.from(JSON.stringify({ c: "ayer", i: PERSON, g: "2026-11-05T10:00:00.000Z" })).toString("base64url"),
    Buffer.from(JSON.stringify({ c: cursor.changedAt, i: "no-uuid", g: cursor.snapshot })).toString("base64url"),
    Buffer.from(JSON.stringify({ c: cursor.changedAt, i: "1' or '1'='1", g: cursor.snapshot })).toString("base64url")]) {
    assert.equal(decodeCursor(bad), null, bad);
  }
  assert.equal(parseParticipantsQuery(url(`?event_id=${EVENT}&cursor=basura`)).ok, false);
});

test("organizador activo: aprobado a mano o con licencia vigente", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(isOrganizerActive({ organizer_verified: true, license_valid_until: null }, now), true, "aprobado por un admin");
  assert.equal(isOrganizerActive({ organizer_verified: false, license_valid_until: "2026-12-01T00:00:00+00:00" }, now), true, "licencia vigente");
  assert.equal(isOrganizerActive({ organizer_verified: false, license_valid_until: "infinity" }, now), true, "licencia sin vencimiento");
  assert.equal(isOrganizerActive({ organizer_verified: false, license_valid_until: "2026-11-01T00:00:00+00:00" }, now), false, "licencia vencida");
  assert.equal(isOrganizerActive({ organizer_verified: false, license_valid_until: null }, now), false, "sin licencia ni aprobación");
  assert.equal(isOrganizerActive({ organizer_verified: null, license_valid_until: "basura" }, now), false);
  assert.equal(isOrganizerActive(null, now), false, "sin perfil de organizador");
  assert.equal(isOrganizerActive(undefined, now), false);
});

test("un rating por modalidad activa; quien no tiene empieza en el rating inicial", () => {
  const stored = { lazo: { rating: 9.4, events: 18, wins: 6, updated_at: "2026-11-02T10:00:00+00:00" }, barriles: { rating: 7, events: 1, wins: 0, updated_at: null } };
  assert.deepEqual(buildRatings(stored, ["lazo"], 1), { lazo: { rating: 9.4, events: 18, wins: 6, updated_at: "2026-11-02T10:00:00+00:00" } }, "barriles no está activa: no se envía");
  assert.deepEqual(buildRatings({}, ["lazo"], 1), { lazo: { rating: 1, events: 0, wins: 0, updated_at: null } });
  assert.deepEqual(buildRatings(null, ["lazo"], 1), { lazo: { rating: 1, events: 0, wins: 0, updated_at: null } });
  assert.equal(buildRatings({ lazo: { rating: "8.50", events: 2, wins: 1, updated_at: null } }, ["lazo"], 1).lazo.rating, 8.5, "numeric llega como texto");
});

const row = (n, changedAt = `2026-11-02T10:00:${String(n % 60).padStart(2, "0")}+00:00`) => ({
  global_id: `51000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name: `Persona ${n}`, email: `p${n}@example.com`, claimed: n % 2 === 0,
  changed_at: changedAt, ratings: null,
});

test("una página pequeña no trae cursor y repite el corte de la consulta", () => {
  const page = buildPage([row(1), row(2)], "2026-11-05T10:00:00.000Z", ["lazo"], 1);
  assert.equal(page.participants.length, 2);
  assert.equal(page.next_cursor, null);
  assert.equal(page.generated_at, "2026-11-05T10:00:00.000Z");
  assert.deepEqual(page.participants[0], {
    global_id: row(1).global_id, name: "Persona 1", email: "p1@example.com", claimed: false,
    ratings: { lazo: { rating: 1, events: 0, wins: 0, updated_at: null } },
  });
});

test("con una fila de más hay otra página: el cursor apunta al último de ESTA página y conserva el corte", () => {
  const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => row(i + 1));
  const page = buildPage(rows, "2026-11-05T10:00:00.000Z", ["lazo"], 1);
  assert.equal(page.participants.length, PAGE_SIZE, "la fila de más no se envía");
  const cursor = decodeCursor(page.next_cursor);
  assert.equal(cursor.id, rows[PAGE_SIZE - 1].global_id);
  assert.equal(cursor.changedAt, rows[PAGE_SIZE - 1].changed_at);
  assert.equal(cursor.snapshot, "2026-11-05T10:00:00.000Z");
  const exact = buildPage(rows.slice(0, PAGE_SIZE), "2026-11-05T10:00:00.000Z", ["lazo"], 1);
  assert.equal(exact.next_cursor, null, "justo el tamaño de página no genera otra");
});

test("la respuesta nunca trae celular, ids de cuenta ni campos internos", () => {
  const leaky = { ...row(1), phone_e164: "+528112345678", user_id: "x", merged_into: null };
  const [participant] = buildPage([leaky], "2026-11-05T10:00:00.000Z", ["lazo"], 1).participants;
  assert.deepEqual(Object.keys(participant).sort(), ["claimed", "email", "global_id", "name", "ratings"]);
  assert.doesNotMatch(JSON.stringify(participant), /phone|user_id|merged|\+52/);
});
