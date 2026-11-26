import test from "node:test";
import assert from "node:assert/strict";
import { ownRows } from "../src/lib/data/own-rows.ts";

const ME = "11111111-1111-4111-8111-111111111111";

// Cliente falso: guarda lo que se le pide a la base.
function fakeClient() {
  const calls = [];
  const query = new Proxy({}, { get: (_, name) => (...args) => (calls.push([name, ...args]), query) });
  return { calls, from: (table) => (calls.push(["from", table]), query) };
}

for (const [table, newestBy] of [["registrations", "created_at"], ["registration_removals", "removed_at"]]) {
  test(`${table}: solo pide las filas de mi perfil (KIN-627)`, () => {
    const client = fakeClient();
    ownRows(client, table, "id", ME, newestBy);
    assert.deepEqual(client.calls, [["from", table], ["select", "id"], ["eq", "roper_id", ME], ["order", newestBy, { ascending: false }]]);
  });
}
