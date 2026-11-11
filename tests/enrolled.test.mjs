import test from "node:test";
import assert from "node:assert/strict";
import { ENROLLED_PAGE_SIZE, decodeEnrolledCursor, encodeEnrolledCursor, toEnrolledPage } from "../src/lib/enrolled.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const AT = "2026-11-01T11:00:00.123456+00:00";
const row = (n) => ({
  roper_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, full_name: `Persona ${n}`, avatar_path: null, rating: "7.50", events_count: 3, wins: 1,
  is_initial: false, enrolled_at: `2026-11-01T11:00:${String(n % 60).padStart(2, "0")}.000001+00:00`,
});

test("el cursor conserva los microsegundos y sale y entra igual", () => {
  const c = { at: AT, id: ID };
  assert.equal(encodeEnrolledCursor(c), `${AT}~${ID}`);
  assert.deepEqual(decodeEnrolledCursor(encodeEnrolledCursor(c)), { ok: true, cursor: c });
  assert.deepEqual(decodeEnrolledCursor("2026-11-01T11:00:00Z~" + ID), { ok: true, cursor: { at: "2026-11-01T11:00:00Z", id: ID } });
  assert.deepEqual(decodeEnrolledCursor("2026-11-01T11:00:00-06:00~" + ID), { ok: true, cursor: { at: "2026-11-01T11:00:00-06:00", id: ID } });
});

test("sin cursor es la primera página, y lo inválido se rechaza", () => {
  assert.deepEqual(decodeEnrolledCursor(null), { ok: true, cursor: null });
  assert.deepEqual(decodeEnrolledCursor(""), { ok: true, cursor: null });
  for (const bad of ["abc", AT, `${AT}~x`, `2026-13-45T11:00:00Z~${ID}`, `${ID}~${AT}`, `${AT}~${ID}; drop table`, `2026-11-01~${ID}`]) {
    assert.deepEqual(decodeEnrolledCursor(bad), { ok: false }, bad);
  }
});

test("el id del cursor se normaliza a minúsculas", () => {
  assert.deepEqual(decodeEnrolledCursor(`${AT}~${ID.toUpperCase()}`), { ok: true, cursor: { at: AT, id: ID } });
});

test("una página con una fila de más indica que hay otra y el cursor apunta al último entregado", () => {
  const page = toEnrolledPage(Array.from({ length: ENROLLED_PAGE_SIZE + 1 }, (_, i) => row(i + 1)), ENROLLED_PAGE_SIZE);
  assert.equal(page.rows.length, ENROLLED_PAGE_SIZE);
  const last = page.rows[page.rows.length - 1];
  assert.equal(page.next, `${last.enrolledAt}~${last.id}`);
  assert.equal(page.rows[0].rating, 7.5);
  assert.equal(page.rows[0].initial, false);
});

test("la última página y una vacía no traen siguiente", () => {
  assert.equal(toEnrolledPage([row(1), row(2)], ENROLLED_PAGE_SIZE).next, null);
  assert.deepEqual(toEnrolledPage([], ENROLLED_PAGE_SIZE), { rows: [], next: null });
  assert.equal(toEnrolledPage(Array.from({ length: ENROLLED_PAGE_SIZE }, (_, i) => row(i + 1)), ENROLLED_PAGE_SIZE).next, null);
});
