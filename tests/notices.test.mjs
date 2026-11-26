import test from "node:test";
import assert from "node:assert/strict";
import { isNewer, showBanner } from "../src/lib/notices.ts";

const old = "2026-11-25T10:00:00.000000+00:00";
const recent = "2026-11-26T10:00:00.000000+00:00";

test("el texto del aviso se esconde una vez visto y vuelve solo con un aviso más nuevo", () => {
  assert.equal(showBanner({ count: 1, latest: old }, null), true);
  assert.equal(showBanner({ count: 1, latest: old }, old), false);
  assert.equal(showBanner({ count: 2, latest: recent }, old), true);
  assert.equal(showBanner({ count: 0, latest: null }, null), false);
});

test("solo cuenta como nuevo un aviso posterior al último conocido", () => {
  assert.equal(isNewer(recent, old), true);
  assert.equal(isNewer(old, recent), false); // al leer el más nuevo queda uno anterior: no es una llegada
  assert.equal(isNewer(old, old), false);
  assert.equal(isNewer(null, old), false);
});
