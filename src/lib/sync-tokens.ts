import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

// Códigos de conexión de la app local. En la base (api_tokens) se guarda SOLO el hash sha256; el código en claro se
// muestra una vez al generarlo y nunca se escribe en la base ni en los registros del servidor.
// Con SUPABASE_SERVICE_ROLE_KEY usa la base. Sin esa llave usa memoria, solo para desarrollo (se pierde al reiniciar)
// y se niega a funcionar en producción.

export type SyncTokenInfo = { createdAt: string; lastUsedAt: string | null };

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const newCode = () => `rm_${randomBytes(24).toString("base64url")}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// last_used_at se actualiza como máximo una vez por minuto para no escribir en la base en cada petición.
const TOUCH_EVERY_MS = 60_000;

// --- Respaldo en memoria (solo desarrollo) ---
type Entry = { organizer: string; createdAt: string; lastUsedAt: string | null };
const g = globalThis as unknown as { __rmTokens?: Map<string, Entry> };
const mem = (g.__rmTokens ??= new Map<string, Entry>());

function backend() {
  const db = adminClient();
  if (db) return db;
  if (process.env.NODE_ENV === "production") throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY: los códigos de conexión no se pueden guardar");
  return null;
}

// Genera un código nuevo y revoca el anterior de ese organizador (en una sola transacción en la base).
export async function createSyncToken(organizer: string): Promise<string> {
  const raw = newCode();
  const db = backend();
  if (!db) {
    for (const [h, e] of mem) if (e.organizer === organizer) mem.delete(h);
    mem.set(hash(raw), { organizer, createdAt: new Date().toISOString(), lastUsedAt: null });
    return raw;
  }
  if (!UUID.test(organizer)) throw new Error("El organizador no tiene una cuenta real todavía");
  const { error } = await db.rpc("rotate_api_token", { p_organizer: organizer, p_hash: hash(raw) });
  if (error) throw new Error(`No se pudo guardar el código (${error.code ?? "error"})`);
  return raw;
}

// Devuelve el organizador dueño del código, o null si no existe o fue revocado.
export async function verifySyncToken(raw: string): Promise<string | null> {
  const h = hash(raw);
  const db = backend();
  if (!db) {
    const e = mem.get(h);
    if (!e) return null;
    e.lastUsedAt = new Date().toISOString();
    return e.organizer;
  }
  const { data, error } = await db.from("api_tokens").select("id, organizer_id, last_used_at").eq("token_hash", h).is("revoked_at", null).maybeSingle();
  if (error) throw new Error(`No se pudo verificar el código (${error.code ?? "error"})`);
  if (!data) return null;
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  if (Date.now() - last > TOUCH_EVERY_MS) {
    // Si falla el registro de uso no se rechaza una petición válida.
    await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  }
  return data.organizer_id as string;
}

export async function activeSyncToken(organizer: string): Promise<SyncTokenInfo | null> {
  const db = backend();
  if (!db) {
    for (const e of mem.values()) if (e.organizer === organizer) return { createdAt: e.createdAt, lastUsedAt: e.lastUsedAt };
    return null;
  }
  if (!UUID.test(organizer)) return null;
  const { data, error } = await db.from("api_tokens").select("created_at, last_used_at").eq("organizer_id", organizer).is("revoked_at", null).maybeSingle();
  if (error) throw new Error(`No se pudo leer el código (${error.code ?? "error"})`);
  return data ? { createdAt: data.created_at as string, lastUsedAt: (data.last_used_at as string | null) ?? null } : null;
}

// Revoca el código activo sin generar otro. Deja de funcionar al instante.
export async function revokeSyncToken(organizer: string): Promise<void> {
  const db = backend();
  if (!db) {
    for (const [h, e] of mem) if (e.organizer === organizer) mem.delete(h);
    return;
  }
  if (!UUID.test(organizer)) return;
  const { error } = await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("organizer_id", organizer).is("revoked_at", null);
  if (error) throw new Error(`No se pudo revocar el código (${error.code ?? "error"})`);
}
