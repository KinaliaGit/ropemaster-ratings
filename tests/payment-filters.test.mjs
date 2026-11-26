import test from "node:test";
import assert from "node:assert/strict";
import { parsePaymentFilters, paymentFiltersQuery, sanitizePaymentsQuery } from "../src/lib/payment-filters.ts";

const from = (o) => (k) => o[k];

test("sin parámetros: todos los eventos, pendientes y sin búsqueda", () => {
  assert.deepEqual(parsePaymentFilters(from({})), { event: null, status: "pendiente", q: "", arena: "" });
});
test("acepta evento, estado y búsqueda válidos", () => {
  assert.deepEqual(parsePaymentFilters(from({ evento: "gran-final-ab12", estado: "pagado", q: "Ana" })), { event: "gran-final-ab12", status: "pagado", q: "Ana", arena: "" });
  assert.equal(parsePaymentFilters(from({ estado: "todos" })).status, "todos");
});
test("un estado desconocido vuelve a pendiente y un evento con caracteres raros se ignora", () => {
  const f = parsePaymentFilters(from({ evento: "../admin?x=1", estado: "reembolsado" }));
  assert.equal(f.event, null);
  assert.equal(f.status, "pendiente");
});
test("la búsqueda se recorta a 80 caracteres", () => {
  assert.equal(parsePaymentFilters(from({ q: "x".repeat(200) })).q.length, 80);
});
test("los filtros se vuelven a escribir en la URL, siempre con el estado", () => {
  assert.equal(paymentFiltersQuery({ event: null, status: "pendiente", q: "" }), "estado=pendiente");
  assert.equal(paymentFiltersQuery({ event: "a-1", status: "todos", q: "Ana López" }), "evento=a-1&estado=todos&q=Ana+L%C3%B3pez");
});
test("la consulta que vuelve del formulario solo conserva parámetros conocidos", () => {
  assert.equal(sanitizePaymentsQuery("evento=a-1&estado=pagado&q=Ana&next=https://malo.example&pagoError=0"), "evento=a-1&estado=pagado&q=Ana");
  assert.equal(sanitizePaymentsQuery("evento=A%20B&estado=zzz"), "estado=pendiente");
});
test("si falló el cambio se marca el error", () => {
  assert.equal(sanitizePaymentsQuery("estado=pendiente", true), "estado=pendiente&pagoError=1");
});

test("el filtro por arena acepta una llave válida y descarta lo demás (KIN-765)", () => {
  assert.equal(parsePaymentFilters(from({ arena: "lienzo charro del norte" })).arena, "lienzo charro del norte");
  assert.equal(parsePaymentFilters(from({ arena: "  arena 2 " })).arena, "arena 2");
  for (const bad of ["Lienzo Charro", "a--b", "../x", "a;drop", ""]) assert.equal(parsePaymentFilters(from({ arena: bad })).arena, "", bad);
  assert.equal(parsePaymentFilters(from({ arena: "x".repeat(200) })).arena.length, 120); // se recorta, igual que parseArenaParam
});
test("la arena viaja en la URL y sobrevive al volver de marcar un pago", () => {
  assert.equal(paymentFiltersQuery({ event: null, status: "pendiente", q: "", arena: "arena 2" }), "arena=arena+2&estado=pendiente");
  assert.equal(sanitizePaymentsQuery("arena=arena+2&estado=pagado&evento=a-1&otro=1"), "evento=a-1&arena=arena+2&estado=pagado");
  assert.equal(sanitizePaymentsQuery("arena=Mala%20Llave&estado=pagado"), "estado=pagado");
});
