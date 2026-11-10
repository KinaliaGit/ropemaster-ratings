import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_VERSION, PAGE_SIZE, buildEventsPage, checkVersion, decodeCursor, encodeCursor, parseEventsQuery, parseIso,
} from "../src/lib/app-events.ts";

const example = JSON.parse(readFileSync(fileURLToPath(new URL("../docs/sync-examples/eventos.response.json", import.meta.url)), "utf8"));
const url = (query) => new URL(`https://ratings.example.com/api/app/eventos${query}`);
const EVENT = "e0000000-0000-0000-0000-0000000000e1";

// Las filas tal como las entrega la función de la base (app_organizer_events): de aquí sale el ejemplo del contrato.
const dbRow = () => ({
  id: EVENT, slug: "rodeo-norte-2026", name: "Rodeo Norte 2026", event_date: "2026-12-06", city: "Monterrey", venue: "Lienzo Charro del Norte",
  description: "Rodeo de fin de año, lazo en equipo.", disciplines: ["lazo"], capacity: 100, status: "publicado", changed_at: "2026-11-05T18:30:00+00:00",
  categories: example.events[0].categories,
  registrations: example.events[0].registrations,
});

test("la respuesta armada desde la base es exactamente el ejemplo versionado del contrato", () => {
  const page = buildEventsPage([dbRow()], example.organizer, example.generated_at);
  assert.deepEqual(page, example);
});

test("el ejemplo cumple el contrato: tipos, enums, centavos enteros y fechas ISO", () => {
  assert.equal(example.contract_version, CONTRACT_VERSION);
  for (const event of example.events) {
    assert.ok(["publicado", "finalizado"].includes(event.status), "los borradores no se envían");
    assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(event.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    for (const c of event.categories) assert.ok(Number.isInteger(c.fee_cents) && c.fee_cents >= 0);
    for (const r of event.registrations) {
      assert.ok(["pendiente", "pagado", "reembolsado"].includes(r.payment_status));
      assert.ok(r.payment_method === null || ["efectivo", "transferencia", "stripe"].includes(r.payment_method));
      assert.ok(Number.isInteger(r.amount_cents) && r.amount_cents >= 0);
      assert.ok(event.categories.some((c) => c.id === r.category_id && c.name === r.category), "la categoría de la inscripción existe en el evento");
      assert.deepEqual(Object.keys(r).sort(), ["amount_cents", "category", "category_id", "id", "name", "payment_method", "payment_status", "roper_global_id"],
        "ni correo ni celular ni ids de cuenta");
    }
  }
});

test("un evento sin datos opcionales no rompe a la app: texto vacío, listas vacías", () => {
  const page = buildEventsPage([{ ...dbRow(), event_date: null, city: null, venue: null, description: null, disciplines: null, capacity: null, categories: null, registrations: null }], "org", "2026-11-06T09:00:00.000Z");
  const [event] = page.events;
  assert.deepEqual([event.date, event.city, event.venue, event.description, event.disciplines, event.capacity], ["", "", "", "", [], null]);
  assert.deepEqual([event.categories, event.registrations], [[], []]);
});

test("since acepta fechas ISO con hora y las normaliza; rechaza lo demás con invalid_field", () => {
  assert.equal(parseIso("2026-11-05T04:00:00-06:00"), "2026-11-05T10:00:00.000Z");
  assert.deepEqual(parseEventsQuery(url("")).value, { since: null, cursor: null });
  assert.equal(parseEventsQuery(url("?since=2026-11-05T10:00:00Z")).value.since, "2026-11-05T10:00:00.000Z");
  for (const bad of ["ayer", "2026-11-05", "2026-13-45T10:00:00Z", "1;drop table events", "2026-11-05 10:00:00"]) {
    const result = parseEventsQuery(url(`?since=${encodeURIComponent(bad)}`));
    assert.equal(result.ok, false, bad);
    assert.deepEqual([result.status, result.code], [400, "invalid_field"]);
  }
});

test("el cursor va y viene sin perder los microsegundos, y uno inventado se rechaza", () => {
  const cursor = { changedAt: "2026-11-02T10:00:00.123456+00:00", id: EVENT, snapshot: "2026-11-05T10:00:00.000Z" };
  const raw = encodeCursor(cursor);
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCursor(raw), cursor);
  assert.deepEqual(parseEventsQuery(url(`?cursor=${raw}`)).value.cursor, cursor);
  for (const bad of ["no-es-base64!", Buffer.from("{}").toString("base64url"), Buffer.from(JSON.stringify({ c: "ayer", i: EVENT, g: cursor.snapshot })).toString("base64url"),
    Buffer.from(JSON.stringify({ c: cursor.changedAt, i: "1' or '1'='1", g: cursor.snapshot })).toString("base64url")]) {
    assert.equal(parseEventsQuery(url(`?cursor=${bad}`)).ok, false, bad);
  }
});

test("la versión del contrato: sin encabezado se asume la actual; una mayor es 426; basura es 400", () => {
  assert.equal(checkVersion(null), null);
  assert.equal(checkVersion(""), null);
  assert.equal(checkVersion("1"), null);
  assert.deepEqual([checkVersion("2").status, checkVersion("2").code], [426, "version_unsupported"]);
  for (const bad of ["abc", "0", "-1", "1.5"]) assert.deepEqual([checkVersion(bad).status, checkVersion(bad).code], [400, "invalid_field"], bad);
});

test("una página llena avisa que hay más y el cursor apunta al último evento SIN truncar la fecha", () => {
  const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
    ...dbRow(), id: `e0000000-0000-0000-0000-${String(i).padStart(12, "0")}`, changed_at: `2026-11-05T18:30:00.${String(i).padStart(6, "0")}+00:00`,
  }));
  const page = buildEventsPage(rows, "org", "2026-11-06T09:00:00.000Z");
  assert.equal(page.events.length, PAGE_SIZE);
  assert.notEqual(page.next_cursor, null);
  const last = rows[PAGE_SIZE - 1];
  assert.deepEqual(decodeCursor(page.next_cursor), { changedAt: last.changed_at, id: last.id, snapshot: "2026-11-06T09:00:00.000Z" });
  assert.equal(buildEventsPage(rows.slice(0, PAGE_SIZE), "org", "2026-11-06T09:00:00.000Z").next_cursor, null, "justo una página: no hay más");
});
