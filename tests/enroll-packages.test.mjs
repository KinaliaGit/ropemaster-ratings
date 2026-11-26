import test from "node:test";
import assert from "node:assert/strict";
import { enrollPackages } from "../src/lib/enroll-packages.ts";

const f = (single, header, heeler) => ({ single, header, heeler });

test("KIN-793: con un solo rol se pide un número de paquetes de 1 a 99 y va a ese lado", () => {
  assert.deepEqual(enrollPackages("header", f("2", "9", "9")), { header: 2, heeler: 0, total: 2, valid: true });
  assert.deepEqual(enrollPackages("heeler", f("3", "9", "9")), { header: 0, heeler: 3, total: 3, valid: true });
  assert.equal(enrollPackages("header", f("0", "1", "1")).valid, false);
  assert.equal(enrollPackages("heeler", f("100", "1", "1")).valid, false);
  assert.equal(enrollPackages("header", f("", "1", "1")).valid, false);
  assert.equal(enrollPackages("header", f("1.5", "1", "1")).valid, false);
});

test("KIN-793: con 'los dos' cada lado lleva SU número (0 a 99) y el total debe ser al menos 1", () => {
  assert.deepEqual(enrollPackages("both", f("9", "1", "1")), { header: 1, heeler: 1, total: 2, valid: true });
  assert.deepEqual(enrollPackages("both", f("9", "2", "0")), { header: 2, heeler: 0, total: 2, valid: true });
  assert.deepEqual(enrollPackages("both", f("9", "0", "3")), { header: 0, heeler: 3, total: 3, valid: true });
  assert.deepEqual(enrollPackages("both", f("9", "2", "3")), { header: 2, heeler: 3, total: 5, valid: true });
  assert.equal(enrollPackages("both", f("9", "0", "0")).valid, false, "0 y 0 no alcanza");
  assert.equal(enrollPackages("both", f("9", "-1", "2")).valid, false);
  assert.equal(enrollPackages("both", f("9", "100", "0")).valid, false);
  assert.equal(enrollPackages("both", f("9", "", "2")).valid, false, "un lado vacío no vale");
});

test("KIN-793: el campo de un rol no afecta al de 'los dos' ni al revés", () => {
  assert.equal(enrollPackages("both", f("", "1", "1")).valid, true);
  assert.equal(enrollPackages("header", f("2", "", "")).valid, true);
});
