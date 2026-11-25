import test from "node:test";
import assert from "node:assert/strict";
import { buildNoticeEmail } from "../src/lib/notify-emails.ts";

const base = { kind: "removed", lang: "es", name: "Ana", eventName: "Rodeo Norte", eventDate: "2026-12-05", place: "Lienzo, Monterrey", organizer: "Rodeo Norte AC", contact: "org@x.com", reason: "No se recibió el pago", paid: false };

test("el correo de salida lleva evento, fecha, lugar, organizador, motivo y contacto", () => {
  const m = buildNoticeEmail(base);
  assert.equal(m.subject, "Te sacaron del evento Rodeo Norte");
  for (const piece of ["Rodeo Norte", "5 de diciembre de 2026", "Lienzo, Monterrey", "Rodeo Norte AC", "No se recibió el pago", "org@x.com"]) assert.ok(m.text.includes(piece), piece);
});

test("si el pago ya estaba hecho avisa que no hay reembolso automático", () => {
  assert.ok(buildNoticeEmail({ ...base, paid: true }).text.includes("reembolso"));
  assert.ok(!buildNoticeEmail(base).text.includes("reembolso"));
});

test("el motivo que escribe el organizador va escapado en el HTML", () => {
  const m = buildNoticeEmail({ ...base, reason: '<script>alert("x")</script>' });
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&lt;script&gt;"));
});

test("sale en inglés y distingue evento borrado", () => {
  const m = buildNoticeEmail({ ...base, lang: "en", kind: "event_deleted", contact: null });
  assert.equal(m.subject, "Rodeo Norte was canceled");
  assert.ok(m.text.includes("December 5, 2026"));
  assert.ok(m.text.includes("contact the organizer from the event page"));
});

test("el aviso de lista de espera dice que ya está inscrito, sin motivo y con el pago pendiente", () => {
  const m = buildNoticeEmail({ ...base, kind: "promoted", reason: "" });
  assert.equal(m.subject, "Ya estás inscrito en Rodeo Norte");
  assert.ok(m.text.includes("lista de espera"));
  assert.ok(m.text.includes("pendiente de pago"));
  assert.ok(!m.text.includes("Motivo"));
  const en = buildNoticeEmail({ ...base, kind: "promoted", lang: "en", reason: "" });
  assert.equal(en.subject, "You are now registered for Rodeo Norte");
  assert.ok(!en.text.includes("Reason"));
});
