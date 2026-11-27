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
  description: "Rodeo de fin de año, lazo en equipo.", disciplines: ["lazo"], capacity: 100, max_roper_rating: 6.5, draw_type: "lazada_sorteada", lazada_shots_per_package: 3, max_team_rating: 12.5, rounds: 4, series: example.events[0].series, arena: example.events[0].arena, status: "publicado", changed_at: "2026-11-05T18:30:00+00:00",
  categories: example.events[0].categories,
  registrations: example.events[0].registrations,
  waitlist: example.events[0].waitlist.map((w) => { const row = { ...w }; delete row.position; return row; }), // la ruta la agrega; `position` lo calcula buildEventsPage
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
    assert.ok(["round_robin", "lazada_sorteada"].includes(event.draw_type), "draw_type es round_robin o lazada_sorteada");
    assert.ok(event.lazada_shots_per_package === null || (Number.isInteger(event.lazada_shots_per_package) && event.lazada_shots_per_package >= 1));
    assert.ok(event.lazada_shots_per_package === null || event.draw_type === "lazada_sorteada", "los tiros por paquete solo existen en Lazada Sorteada");
    assert.ok(event.max_team_rating === null || (event.max_team_rating >= 0 && event.max_team_rating <= 20));
    for (const c of event.categories) assert.ok(Number.isInteger(c.fee_cents) && c.fee_cents >= 0);
    for (const r of event.registrations) {
      assert.ok(["pendiente", "pagado", "reembolsado"].includes(r.payment_status));
      assert.ok(r.payment_method === null || ["efectivo", "transferencia", "stripe"].includes(r.payment_method));
      assert.ok(Number.isInteger(r.amount_cents) && r.amount_cents >= 0);
      assert.ok(r.role === null || ["header", "heeler"].includes(r.role), "role es header, heeler o null");
      assert.ok(Number.isInteger(r.packages) && r.packages >= 1 && r.packages <= 99, "packages es un entero de 1 a 99");
      assert.ok(r.packages === 1 || event.draw_type === "lazada_sorteada", "más de un paquete solo en Lazada Sorteada");
      const fee = event.categories.find((c) => c.id === r.category_id).fee_cents;
      if (r.payment_status !== "reembolsado") assert.equal(r.amount_cents, fee * r.packages, "el monto es costo * paquetes");
      assert.ok(event.categories.some((c) => c.id === r.category_id && c.name === r.category), "la categoría de la inscripción existe en el evento");
      assert.deepEqual(Object.keys(r).sort(), ["amount_cents", "category", "category_id", "id", "name", "packages", "payment_method", "payment_status", "role", "roper_global_id"],
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

test("el rating máximo individual (KIN-638) sale como número, o null cuando no hay límite o la fila no lo trae", () => {
  const [withLimit] = buildEventsPage([{ ...dbRow(), max_roper_rating: "6.5" }], "org", "2026-11-06T09:00:00.000Z").events;
  assert.equal(withLimit.max_roper_rating, 6.5);
  const withoutField = dbRow();
  delete withoutField.max_roper_rating;
  for (const row of [{ ...dbRow(), max_roper_rating: null }, withoutField]) {
    assert.equal(buildEventsPage([row], "org", "2026-11-06T09:00:00.000Z").events[0].max_roper_rating, null);
  }
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

test("la serie del evento (KIN-625) sale con datos públicos, o null si el evento está suelto o la fila no la trae", () => {
  const [inSeries] = buildEventsPage([dbRow()], "org", "2026-11-06T09:00:00.000Z").events;
  assert.deepEqual(Object.keys(inSeries.series).sort(), ["end_date", "id", "name", "slug", "start_date"], "sin plantilla ni instrucciones de pago");
  const withoutField = dbRow();
  delete withoutField.series;
  for (const row of [{ ...dbRow(), series: null }, withoutField]) {
    assert.equal(buildEventsPage([row], "org", "2026-11-06T09:00:00.000Z").events[0].series, null);
  }
  const [noSlug] = buildEventsPage([{ ...dbRow(), series: { ...example.events[0].series, slug: null } }], "org", "2026-11-06T09:00:00.000Z").events;
  assert.equal(noSlug.series.slug, "");
});

test("una fila de una web anterior (sin tipo ni paquetes) se entiende como round_robin y 1 paquete", () => {
  const row = dbRow();
  delete row.draw_type; delete row.lazada_shots_per_package; delete row.max_team_rating;
  row.registrations = row.registrations.map((r) => { const rest = { ...r }; delete rest.packages; return rest; });
  const [event] = buildEventsPage([row], example.organizer, example.generated_at).events;
  assert.equal(event.draw_type, "round_robin");
  assert.equal(event.lazada_shots_per_package, null);
  assert.equal(event.max_team_rating, null);
  assert.ok(event.registrations.every((r) => r.packages === 1));
});

test("la lista de espera (KIN-726) viaja aparte de los inscritos, en orden, con su lugar y sin correo ni celular", () => {
  const [event] = buildEventsPage([dbRow()], example.organizer, example.generated_at).events;
  assert.equal(event.waitlist.length, 2);
  assert.deepEqual(event.waitlist.map((w) => w.position), [1, 2]);
  for (const w of event.waitlist) {
    assert.deepEqual(Object.keys(w).sort(), ["category", "category_id", "id", "joined_at", "name", "packages", "position", "role", "roper_global_id"]);
    assert.ok(w.role === null || ["header", "heeler"].includes(w.role));
    assert.ok(Number.isInteger(w.packages) && w.packages >= 1 && w.packages <= 99);
    assert.match(w.joined_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(!event.registrations.some((r) => r.id === w.id), "quien espera no está entre los inscritos");
  }
});

test("una fila sin lista de espera (web anterior o evento sin espera) llega como lista vacía", () => {
  const row = dbRow();
  delete row.waitlist;
  assert.deepEqual(buildEventsPage([row], example.organizer, example.generated_at).events[0].waitlist, []);
});

test("la arena del evento (KIN-751) sale con id, nombre y ciudad, o null si el evento no tiene o la fila no la trae", () => {
  const [linked] = buildEventsPage([dbRow()], "org", "2026-11-06T09:00:00.000Z").events;
  assert.deepEqual(Object.keys(linked.arena).sort(), ["city", "id", "name"], "sin notas internas");
  assert.equal(linked.arena.name, linked.venue, "el nombre de la arena es el venue del evento");
  const withoutField = dbRow();
  delete withoutField.arena;
  for (const row of [{ ...dbRow(), arena: null }, withoutField]) {
    const [event] = buildEventsPage([row], "org", "2026-11-06T09:00:00.000Z").events;
    assert.equal(event.arena, null);
    assert.equal(event.venue, "Lienzo Charro del Norte", "venue y city siguen viajando igual sin arena");
  }
  const [noCity] = buildEventsPage([{ ...dbRow(), arena: { ...example.events[0].arena, city: null } }], "org", "2026-11-06T09:00:00.000Z").events;
  assert.equal(noCity.arena.city, "");
});

test("el tope de rating por equipo solo viaja en Lazada Sorteada; en Round Robin va null aunque la base lo tenga (KIN-776)", () => {
  const [rr] = buildEventsPage([{ ...dbRow(), draw_type: "round_robin", max_team_rating: 12.5 }], example.organizer, example.generated_at).events;
  assert.equal(rr.max_team_rating, null);
  const [lazada] = buildEventsPage([{ ...dbRow(), draw_type: "lazada_sorteada", max_team_rating: 12.5 }], example.organizer, example.generated_at).events;
  assert.equal(lazada.max_team_rating, 12.5);
});
