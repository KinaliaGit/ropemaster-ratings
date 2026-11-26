import test from "node:test";
import assert from "node:assert/strict";
import { groupOrgEvents, parseShown, pickOrgTab } from "../src/lib/org-panel.ts";

const ev = (id, status, date) => ({ id, status, date });
const ids = (list) => list.map((e) => e.id).join();

test("KIN-763: cada evento en su pestaña y en su orden", () => {
  const g = groupOrgEvents([ev("lejos", "publicado", "2026-12-20"), ev("cerca", "publicado", "2026-12-01"), ev("viejo", "finalizado", "2026-01-01"), ev("ayer", "finalizado", "2026-11-25"), ev("b", "borrador", "2026-12-05")]);
  assert.equal(ids(g.proximos), "cerca,lejos");
  assert.equal(ids(g.pasados), "ayer,viejo");
  assert.equal(ids(g.borradores), "b");
});

test("sin elegir pestaña se abre la primera que tenga eventos", () => {
  const empty = { proximos: [], pasados: [], borradores: [] };
  assert.equal(pickOrgTab(undefined, empty), "proximos");
  assert.equal(pickOrgTab(undefined, { ...empty, borradores: [1] }), "borradores");
  assert.equal(pickOrgTab("pasados", empty), "pasados");
  assert.equal(pickOrgTab("otra", { ...empty, pasados: [1] }), "pasados");
});

test("cuántos mostrar se limita", () => {
  assert.equal(parseShown(undefined), 20);
  assert.equal(parseShown("40"), 40);
  assert.equal(parseShown("1"), 20);
  assert.equal(parseShown("99999"), 20);
  assert.equal(parseShown("5000"), 1000);
});
