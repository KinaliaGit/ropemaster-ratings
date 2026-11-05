import test from "node:test";
import assert from "node:assert/strict";
import { checkImage, sniffImage } from "../src/lib/image-validate.ts";

const bytes = (...n) => Uint8Array.from(n);
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46);
const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const webp = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([1, 2, 3, 4], [..."WEBPVP8 "].map((c) => c.charCodeAt(0))));
const text = (s) => new TextEncoder().encode(s);

test("reconoce JPEG, PNG y WebP por sus bytes", () => {
  assert.equal(sniffImage(jpeg), "image/jpeg");
  assert.equal(sniffImage(png), "image/png");
  assert.equal(sniffImage(webp), "image/webp");
});

test("rechaza lo que no es una imagen aunque se llame .png", () => {
  assert.equal(sniffImage(text("<script>alert(1)</script>")), null);
  assert.equal(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImage(text("GIF89a......")), null);
  assert.equal(sniffImage(text("MZ\u0090\u0000 ejecutable")), null);
  assert.equal(sniffImage(text("RIFF....WAVEfmt ")), null); // RIFF pero no WebP
});

test("checkImage devuelve tipo y extensión", () => {
  assert.deepEqual(checkImage(jpeg, 1000), { ok: true, mime: "image/jpeg", ext: "jpg" });
  assert.deepEqual(checkImage(png, 1000), { ok: true, mime: "image/png", ext: "png" });
  assert.deepEqual(checkImage(webp, 1000), { ok: true, mime: "image/webp", ext: "webp" });
});

test("checkImage aplica el límite de tamaño y el vacío", () => {
  assert.deepEqual(checkImage(new Uint8Array(0), 1000), { ok: false, reason: "empty" });
  const big = new Uint8Array(2000); big.set(jpeg);
  assert.deepEqual(checkImage(big, 1000), { ok: false, reason: "too_big" });
  assert.equal(checkImage(big, 2000).ok, true);
  assert.deepEqual(checkImage(text("hola"), 1000), { ok: false, reason: "not_image" });
});

test("archivos truncados no se aceptan", () => {
  assert.equal(sniffImage(bytes(0xff, 0xd8)), null);
  assert.equal(sniffImage(bytes(0x89, 0x50)), null);
});
