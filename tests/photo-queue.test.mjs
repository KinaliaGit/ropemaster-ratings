import test from "node:test";
import assert from "node:assert/strict";
import { createUploadQueue, IDLE_UPLOADS } from "../src/lib/photo-queue.ts";

const blob = (n) => new Blob([String(n)]);
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(queue) { for (let i = 0; i < 50 && !queue.getSnapshot().finished; i++) await tick(); }

test("sube las fotos en orden, una por una, y al final queda terminada", async () => {
  const seen = [];
  const q = createUploadQueue(async (slug, b) => { seen.push(`${slug}:${await b.text()}`); return true; });
  q.enqueue("mi-evento", [blob(1), blob(2), blob(3)]);
  assert.equal(q.getSnapshot().active, true);
  assert.equal(q.getSnapshot().total, 3);
  await settle(q);
  assert.deepEqual(seen, ["mi-evento:1", "mi-evento:2", "mi-evento:3"]);
  assert.deepEqual(q.getSnapshot(), { active: false, done: 3, total: 3, failed: 0, finished: true });
});

test("cuenta las que fallan (por respuesta falsa o por error) y sigue con las demás", async () => {
  const q = createUploadQueue(async (_slug, b) => {
    const n = await b.text();
    if (n === "2") return false;
    if (n === "3") throw new Error("red");
    return true;
  });
  q.enqueue("e", [blob(1), blob(2), blob(3), blob(4)]);
  await settle(q);
  assert.deepEqual(q.getSnapshot(), { active: false, done: 4, total: 4, failed: 2, finished: true });
});

test("si se agregan fotos mientras sube, se suman al mismo conteo", async () => {
  const q = createUploadQueue(async () => { await tick(); return true; });
  q.enqueue("a", [blob(1), blob(2)]);
  q.enqueue("b", [blob(3)]);
  assert.equal(q.getSnapshot().total, 3);
  await settle(q);
  assert.deepEqual(q.getSnapshot(), { active: false, done: 3, total: 3, failed: 0, finished: true });
});

test("una cola terminada empieza un conteo nuevo con la siguiente subida", async () => {
  const q = createUploadQueue(async () => true);
  q.enqueue("a", [blob(1)]);
  await settle(q);
  assert.equal(q.getSnapshot().finished, true);
  q.enqueue("b", [blob(2), blob(3)]);
  assert.deepEqual(q.getSnapshot(), { active: true, done: 0, total: 2, failed: 0, finished: false });
  await settle(q);
  assert.deepEqual(q.getSnapshot(), { active: false, done: 2, total: 2, failed: 0, finished: true });
});

test("sin fotos no hace nada; dismiss oculta el aviso terminado pero no uno en curso", async () => {
  const q = createUploadQueue(async () => { await tick(); return true; });
  q.enqueue("a", []);
  assert.deepEqual(q.getSnapshot(), IDLE_UPLOADS);
  q.enqueue("a", [blob(1)]);
  q.dismiss();
  assert.equal(q.getSnapshot().active, true); // en curso: no se oculta
  await settle(q);
  q.dismiss();
  assert.deepEqual(q.getSnapshot(), IDLE_UPLOADS);
});

test("avisa a quien escucha en cada cambio y deja de avisar al desuscribirse", async () => {
  const q = createUploadQueue(async () => true);
  let calls = 0;
  const off = q.subscribe(() => { calls++; });
  q.enqueue("a", [blob(1)]);
  await settle(q);
  assert.ok(calls >= 3); // al encolar, al terminar la foto y al terminar la cola
  off();
  const before = calls;
  q.enqueue("a", [blob(2)]);
  await settle(q);
  assert.equal(calls, before);
});
