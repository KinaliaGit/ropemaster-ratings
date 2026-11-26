import test from "node:test";
import assert from "node:assert/strict";
import { dateBlock, mergeUpcoming, pastWithoutResults } from "../src/lib/upcoming.ts";

const at = (id, date) => ({ id, event: { date } });
const ids = (list) => list.map((x) => `${x.kind[0]}:${x.item.id}`);

test("KIN-770: inscripciones y lista de espera salen juntas, por fecha", () => {
  assert.deepEqual(ids(mergeUpcoming([at("b", "2026-12-10"), at("a", "2026-12-01")], [at("w", "2026-12-05")])), ["r:a", "w:w", "r:b"]);
});

test("sin fecha o sin evento va al final; en la misma fecha, primero la inscripción", () => {
  const list = mergeUpcoming([at("sin", null), { id: "nada", event: null }, at("r", "2026-12-01")], [at("w", "2026-12-01")]);
  assert.deepEqual(ids(list), ["r:r", "w:w", "r:sin", "r:nada"]);
});

test("sin nada, lista vacía", () => {
  assert.deepEqual(mergeUpcoming([], []), []);
});

test("el bloque de fecha no se corre de día y aguanta fechas vacías o raras", () => {
  assert.deepEqual(dateBlock("2026-12-01", "es"), { day: "1", month: "dic" });
  assert.deepEqual(dateBlock("2026-12-01", "en"), { day: "1", month: "Dec" });
  for (const bad of [null, undefined, "", "pronto"]) assert.equal(dateBlock(bad, "es"), null);
});

test("pasados: no repite los que ya tienen resultado ni adivina lo que está en páginas sin cargar", () => {
  const reg = (slug, date) => ({ event: { slug, date } });
  const regs = [reg("nuevo", "2026-11-20"), reg("con", "2026-11-18"), reg("viejo", "2026-01-01")];
  const results = [{ slug: "con", date: "2026-11-18" }];
  assert.deepEqual(pastWithoutResults(regs, results, false).map((x) => x.event.slug), ["nuevo", "viejo"]);
  assert.deepEqual(pastWithoutResults(regs, results, true).map((x) => x.event.slug), ["nuevo"]);
  assert.equal(pastWithoutResults(regs, [], false).length, 3);
});
