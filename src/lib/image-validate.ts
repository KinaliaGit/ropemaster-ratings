// Validación de imágenes por sus BYTES reales (no por lo que declare el nombre o el tipo del archivo).
// Sin dependencias para poder probarla con `node --test` (ver tests/image-validate.test.mjs).
export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type ImageExt = "jpg" | "png" | "webp";

const EXT: Record<ImageMime, ImageExt> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (b: Uint8Array, from: number, text: string) => [...text].every((c, i) => b[from + i] === c.charCodeAt(0));

export function sniffImage(b: Uint8Array): ImageMime | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && PNG.every((x, i) => b[i] === x)) return "image/png";
  if (b.length > 12 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return "image/webp";
  return null; // SVG, GIF, HTML, ejecutables disfrazados, etc.
}

export type ImageCheck = { ok: true; mime: ImageMime; ext: ImageExt } | { ok: false; reason: "empty" | "too_big" | "not_image" };

export function checkImage(b: Uint8Array, maxBytes: number): ImageCheck {
  if (b.length === 0) return { ok: false, reason: "empty" };
  if (b.length > maxBytes) return { ok: false, reason: "too_big" };
  const mime = sniffImage(b);
  return mime ? { ok: true, mime, ext: EXT[mime] } : { ok: false, reason: "not_image" };
}
