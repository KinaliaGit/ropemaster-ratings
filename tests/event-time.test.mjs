import test from "node:test";
import assert from "node:assert/strict";
import { closesAfterEvent, fmtDeadline, isoToZonedLocal, isRegistrationOpen, isValidTimezone, zonedDateOf, zonedLocalToIso } from "../src/lib/event-time.ts";

const MX = "America/Mexico_City";

test("la hora local del evento se guarda como instante y vuelve igual", () => {
  const iso = zonedLocalToIso("2026-12-05T18:00", MX);
  assert.equal(iso, "2026-12-06T00:00:00.000Z"); // México es UTC-6 en diciembre
  assert.equal(isoToZonedLocal(iso, MX), "2026-12-05T18:00");
});

test("respeta la zona del evento y el horario de verano", () => {
  assert.equal(zonedLocalToIso("2026-07-01T12:00", "America/New_York"), "2026-07-01T16:00:00.000Z"); // UTC-4 en verano
  assert.equal(zonedLocalToIso("2026-01-01T12:00", "America/New_York"), "2026-01-01T17:00:00.000Z"); // UTC-5 en invierno
  assert.equal(zonedLocalToIso("2026-07-01T12:00", "America/Hermosillo"), "2026-07-01T19:00:00.000Z"); // Sonora no cambia de horario
});

test("fechas, horas o zonas inválidas se rechazan", () => {
  assert.equal(zonedLocalToIso("2026-02-31T10:00", MX), null);
  assert.equal(zonedLocalToIso("2026-12-05T25:00", MX), null);
  assert.equal(zonedLocalToIso("2026-12-05", MX), null);
  assert.equal(zonedLocalToIso("", MX), null);
  assert.equal(zonedLocalToIso("2026-12-05T18:00", "Marte/Olimpo"), null);
  assert.equal(isValidTimezone("Marte/Olimpo"), false);
  assert.equal(isValidTimezone(MX), true);
});

test("la fecha de cierre no puede caer después del día del evento (se mide en la zona del evento)", () => {
  const sameDay = zonedLocalToIso("2026-12-05T23:30", MX); // ya es 6 de diciembre en UTC, pero sigue siendo 5 en México
  assert.equal(zonedDateOf(sameDay, MX), "2026-12-05");
  assert.equal(closesAfterEvent(sameDay, "2026-12-05", MX), false);
  assert.equal(closesAfterEvent(zonedLocalToIso("2026-12-06T00:00", MX), "2026-12-05", MX), true);
  assert.equal(closesAfterEvent(zonedLocalToIso("2026-12-01T08:00", MX), "2026-12-05", MX), false);
});

test("sin fecha las inscripciones siguen abiertas; con fecha se cierran al llegar; el cierre manual manda", () => {
  const closes = "2026-12-01T00:00:00.000Z", before = Date.parse("2026-11-30T23:59:59Z"), after = Date.parse("2026-12-01T00:00:00Z");
  assert.equal(isRegistrationOpen({ closesAt: null, closed: false }, after), true);
  assert.equal(isRegistrationOpen({ closesAt: closes, closed: false }, before), true);
  assert.equal(isRegistrationOpen({ closesAt: closes, closed: false }, after), false);
  assert.equal(isRegistrationOpen({ closesAt: null, closed: true }, before), false);
  assert.equal(isRegistrationOpen({ closesAt: closes, closed: true }, before), false);
});

test("la fecha límite se muestra en la zona del evento", () => {
  const iso = zonedLocalToIso("2026-12-05T18:00", MX);
  assert.match(fmtDeadline(iso, MX, "es"), /5 de diciembre de 2026/);
  assert.match(fmtDeadline(iso, MX, "es"), /6:00/);
  assert.match(fmtDeadline(iso, MX, "en"), /December 5, 2026/);
});
