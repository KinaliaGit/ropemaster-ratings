import test from "node:test";
import assert from "node:assert/strict";
import { closesAfterEvent, hasEventPassed, statusByDate, eventPhase, fmtDeadline, isNotOpenYet, isoToZonedLocal, isRegistrationOpen, isValidTimezone, zonedDateOf, zonedLocalToIso } from "../src/lib/event-time.ts";

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

test("la apertura programada mantiene cerradas las inscripciones hasta su fecha y se abre sola", () => {
  const opens = "2026-12-01T18:00:00.000Z", before = Date.parse("2026-12-01T17:59:59Z"), after = Date.parse("2026-12-01T18:00:00Z");
  assert.equal(isNotOpenYet({ opensAt: opens }, before), true);
  assert.equal(isNotOpenYet({ opensAt: opens }, after), false);
  assert.equal(isNotOpenYet({ opensAt: null }, before), false);
  assert.equal(isRegistrationOpen({ opensAt: opens, closesAt: null, closed: false }, before), false);
  assert.equal(isRegistrationOpen({ opensAt: opens, closesAt: null, closed: false }, after), true);
  assert.equal(isRegistrationOpen({ opensAt: opens, closesAt: "2026-12-10T00:00:00.000Z", closed: false }, Date.parse("2026-12-10T00:00:00Z")), false); // ya cerró
  assert.equal(isRegistrationOpen({ opensAt: opens, closesAt: null, closed: true }, after), false); // cerrado a mano
  assert.equal(isRegistrationOpen({ closesAt: null, closed: false }, before), true); // sin apertura programada: abiertas
});

test("la etapa de un evento de la serie: próximo, abiertas, lleno, cerradas, finalizado y borrador", () => {
  const now = Date.parse("2026-12-01T12:00:00Z");
  const base = { status: "publicado", enrolled: 3, capacity: 10, opensAt: null, closesAt: null, closed: false };
  assert.equal(eventPhase(base, now), "open");
  assert.equal(eventPhase({ ...base, opensAt: "2026-12-05T00:00:00.000Z" }, now), "upcoming");
  assert.equal(eventPhase({ ...base, opensAt: "2026-11-01T00:00:00.000Z" }, now), "open");
  assert.equal(eventPhase({ ...base, enrolled: 10 }, now), "full");
  assert.equal(eventPhase({ ...base, closed: true }, now), "closed");
  assert.equal(eventPhase({ ...base, closesAt: "2026-12-01T00:00:00.000Z" }, now), "closed");
  assert.equal(eventPhase({ ...base, status: "borrador" }, now), "draft");
  assert.equal(eventPhase({ ...base, status: "finalizado", closed: true }, now), "finished");
});

test("KIN-656: la fecha pasada cierra el evento, en la zona del evento y no antes", () => {
  const ev = { date: "2026-11-03", timezone: MX, status: "publicado" };
  const at = (iso) => Date.parse(iso);
  assert.equal(hasEventPassed(ev, at("2026-11-03T20:00:00Z")), false); // el mismo día todavía se puede
  assert.equal(hasEventPassed(ev, at("2026-11-04T05:59:00Z")), false); // en México aún es 3 de noviembre (23:59)
  assert.equal(hasEventPassed(ev, at("2026-11-04T06:00:00Z")), true); // medianoche de México
  assert.equal(statusByDate(ev, at("2026-11-10T00:00:00Z")), "finalizado");
  assert.equal(statusByDate({ ...ev, status: "borrador" }, at("2026-11-10T00:00:00Z")), "borrador"); // solo cierra los publicados
  assert.equal(statusByDate({ ...ev, date: "" }, at("2026-11-10T00:00:00Z")), "publicado"); // sin fecha no se cierra
});

test("KIN-768: en vivo solo el publicado cuya fecha es hoy en la zona del evento", async () => {
  const { isLiveToday } = await import("../src/lib/event-time.ts");
  const now = Date.parse("2026-11-27T03:00:00Z"); // 26 nov, 21:00 en Ciudad de México
  const e = { status: "publicado", date: "2026-11-26", timezone: "America/Mexico_City" };
  assert.equal(isLiveToday(e, now), true);
  assert.equal(isLiveToday({ ...e, date: "2026-11-27" }, now), false);
  assert.equal(isLiveToday({ ...e, date: "2026-11-25" }, now), false);
  assert.equal(isLiveToday({ ...e, status: "finalizado" }, now), false);
  assert.equal(isLiveToday({ ...e, status: "borrador" }, now), false);
});

// ---- KIN-778 ----
import { closeModeOf, endOfDayIso, formatEventTime, isDay, parseEventTime, startOfDayIso } from "../src/lib/event-time.ts";

test("el inicio y el final del día se calculan en la zona del evento", () => {
  assert.equal(startOfDayIso("2026-12-05", MX), "2026-12-05T06:00:00.000Z"); // 00:00 en México = 06:00 UTC
  assert.equal(endOfDayIso("2026-12-05", MX), "2026-12-06T05:59:59.999Z"); // 23:59:59.999 en México
  assert.equal(zonedDateOf(endOfDayIso("2026-12-05", MX), MX), "2026-12-05"); // sigue siendo el mismo día en la zona del evento
});

test("el cierre al final del día no se pasa al día siguiente en el borde (23:59 y cambio de día)", () => {
  const close = Date.parse(endOfDayIso("2026-12-05", MX));
  assert.equal(isRegistrationOpen({ closesAt: new Date(close).toISOString(), closed: false }, Date.parse("2026-12-06T05:59:00.000Z")), true); // 23:59 en México: aún abierto
  assert.equal(isRegistrationOpen({ closesAt: new Date(close).toISOString(), closed: false }, Date.parse("2026-12-06T06:00:00.000Z")), false); // 00:00 del día siguiente: cerrado
});

test("un cierre al final del día del evento no cuenta como después del evento", () => {
  assert.equal(closesAfterEvent(endOfDayIso("2026-12-05", MX), "2026-12-05", MX), false);
  assert.equal(closesAfterEvent(endOfDayIso("2026-12-06", MX), "2026-12-05", MX), true);
});

test("días inválidos no dan instante", () => {
  for (const bad of ["", "2026-13-01", "2026-02-30", "05/12/2026", "2026-12-5"]) {
    assert.equal(isDay(bad), false, bad);
    assert.equal(startOfDayIso(bad, MX), null, bad);
    assert.equal(endOfDayIso(bad, MX), null, bad);
  }
});

test("closeModeOf distingue sin fecha, el día del evento y otro día", () => {
  assert.equal(closeModeOf(null, "2026-12-05", MX), "none");
  assert.equal(closeModeOf(endOfDayIso("2026-12-05", MX), "2026-12-05", MX), "event");
  assert.equal(closeModeOf(endOfDayIso("2026-12-03", MX), "2026-12-05", MX), "day");
  assert.equal(closeModeOf(zonedLocalToIso("2026-12-05T18:00", MX), "2026-12-05", MX), "event"); // un cierre viejo a las 18:00 del mismo día
});

test("la hora del evento: vacía es sin hora; HH:MM válido se conserva; lo demás es inválido", () => {
  assert.equal(parseEventTime(""), null);
  assert.equal(parseEventTime(undefined), null);
  assert.equal(parseEventTime("10:00"), "10:00");
  assert.equal(parseEventTime("09:05"), "09:05");
  assert.equal(parseEventTime("23:59"), "23:59");
  assert.equal(parseEventTime("10:00:00"), "10:00"); // así la entrega la base
  for (const bad of ["24:00", "10:60", "1000", "10:0", "abc", "9:00"]) assert.equal(parseEventTime(bad), "invalid", bad);
});

test("formatEventTime muestra HH:MM y trata lo inválido o vacío como sin hora", () => {
  assert.equal(formatEventTime("10:00:00"), "10:00");
  assert.equal(formatEventTime(null), null);
  assert.equal(formatEventTime("25:00"), null);
});

// ---- el cierre no pasa de la hora del evento ----
import { closeNoLaterThanStart, eventStartIso } from "../src/lib/event-time.ts";

test("el inicio del evento es su día y su hora en la zona del evento", () => {
  assert.equal(eventStartIso("2026-12-28", "12:00", MX), "2026-12-28T18:00:00.000Z"); // 12:00 en México = 18:00 UTC
  assert.equal(eventStartIso("2026-12-28", "12:00:00", MX), "2026-12-28T18:00:00.000Z");
  assert.equal(eventStartIso("2026-12-28", null, MX), null);
  assert.equal(eventStartIso("2026-12-28", "", MX), null);
  assert.equal(eventStartIso("2026-12-28", "25:00", MX), null);
  assert.equal(eventStartIso("no-es-fecha", "12:00", MX), null);
});

test("con hora, las inscripciones cierran cuando empieza el evento y no al final del día (el caso de las 12:00 contra las 23:59)", () => {
  const endOfDay = endOfDayIso("2026-12-28", MX);
  assert.equal(closeNoLaterThanStart(endOfDay, "2026-12-28", "12:00", MX), "2026-12-28T18:00:00.000Z");
  assert.equal(isRegistrationOpen({ closesAt: closeNoLaterThanStart(endOfDay, "2026-12-28", "12:00", MX), closed: false }, Date.parse("2026-12-28T17:59:00.000Z")), true); // 11:59
  assert.equal(isRegistrationOpen({ closesAt: closeNoLaterThanStart(endOfDay, "2026-12-28", "12:00", MX), closed: false }, Date.parse("2026-12-28T18:00:00.000Z")), false); // 12:00
});

test("con hora y sin cierre pedido, también cierran al empezar el evento", () => {
  assert.equal(closeNoLaterThanStart(null, "2026-12-28", "12:00", MX), "2026-12-28T18:00:00.000Z");
});

test("un cierre pedido más temprano que el inicio se respeta; sin hora el cierre queda como se pidió", () => {
  const dayBefore = endOfDayIso("2026-12-27", MX);
  assert.equal(closeNoLaterThanStart(dayBefore, "2026-12-28", "12:00", MX), dayBefore);
  const endOfDay = endOfDayIso("2026-12-28", MX);
  assert.equal(closeNoLaterThanStart(endOfDay, "2026-12-28", null, MX), endOfDay);
  assert.equal(closeNoLaterThanStart(null, "2026-12-28", null, MX), null);
});

test("el cierre al inicio del evento sigue contando como el día del evento", () => {
  const start = closeNoLaterThanStart(endOfDayIso("2026-12-28", MX), "2026-12-28", "12:00", MX);
  assert.equal(closesAfterEvent(start, "2026-12-28", MX), false);
  assert.equal(closeModeOf(start, "2026-12-28", MX), "event");
});
