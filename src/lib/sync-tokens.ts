import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Códigos de conexión de la app local. Se guarda SOLO el hash (nunca el código); el código se muestra una vez.
// En memoria mientras no haya base de datos; se pierden al reiniciar el servidor.
// TODO: pasar a la tabla api_tokens de Supabase (ver migración 0003).
type Entry = { organizer: string; createdAt: string };
const g = globalThis as unknown as { __rmTokens?: Map<string, Entry> };
const store = (g.__rmTokens ??= new Map<string, Entry>());
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

// Genera un código nuevo y revoca el anterior de ese organizador.
export function createSyncToken(organizer: string) {
  for (const [h, e] of store) if (e.organizer === organizer) store.delete(h);
  const raw = `rm_${randomBytes(24).toString("base64url")}`;
  store.set(hash(raw), { organizer, createdAt: new Date().toISOString() });
  return raw;
}

export function verifySyncToken(raw: string): string | null {
  return store.get(hash(raw))?.organizer ?? null;
}

export function activeSyncToken(organizer: string): { createdAt: string } | null {
  for (const e of store.values()) if (e.organizer === organizer) return { createdAt: e.createdAt };
  return null;
}
