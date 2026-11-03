import "server-only";

// Fotos de perfil. En memoria mientras no haya base de datos (se pierden al reiniciar el servidor).
// TODO: guardar en Supabase Storage (bucket "avatars") y la ruta en ropers.avatar_path (migración 0007).
type Entry = { mime: string; bytes: Buffer; v: number };
const g = globalThis as unknown as { __rmAvatars?: Map<string, Entry> };
const store = (g.__rmAvatars ??= new Map<string, Entry>());

export const MAX_AVATAR_BYTES = 300 * 1024;

// Identifica el tipo real por sus primeros bytes (no confiamos en lo que declare el cliente).
function sniff(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export function saveAvatar(id: string, dataUrl: string): boolean {
  if (dataUrl.length > MAX_AVATAR_BYTES * 1.4) return false;
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) return false;
  const bytes = Buffer.from(m[1], "base64");
  const mime = sniff(bytes);
  if (!mime || bytes.length > MAX_AVATAR_BYTES) return false;
  store.set(id, { mime, bytes, v: Date.now() });
  return true;
}

export const getAvatar = (id: string) => store.get(id);
export const removeAvatar = (id: string) => store.delete(id);
// URL con versión para que el navegador muestre la foto nueva al cambiarla.
export const avatarUrl = (id: string): string | null => { const e = store.get(id); return e ? `/api/avatar/${id}?v=${e.v}` : null; };
