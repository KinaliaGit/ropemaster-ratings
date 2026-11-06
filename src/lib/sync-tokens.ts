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
// Un token vence tras estos días sin usarse (la creación cuenta como primer uso). En la base lo decide api_token_idle_days() (0025);
// este número solo lo usa el respaldo en memoria, que debe comportarse igual.
const IDLE_DAYS = 30;
const isIdle = (t: { createdAt: string; lastUsedAt: string | null }) => Date.parse(t.lastUsedAt ?? t.createdAt) < Date.now() - IDLE_DAYS * 86_400_000;

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

// Devuelve el organizador dueño del token (código manual o de un equipo), o null si no existe, fue revocado o venció por inactividad.
// En la base lo decide verify_api_token (0025): también reinicia el plazo y anota el último uso.
export async function verifySyncToken(raw: string): Promise<string | null> {
  const h = hash(raw);
  const db = backend();
  if (!db) {
    const e = mem.get(h);
    if (!e || isIdle(e)) return null;
    e.lastUsedAt = new Date().toISOString();
    return e.organizer;
  }
  const { data, error } = await db.rpc("verify_api_token", { p_hash: h });
  if (error) throw new Error(`No se pudo verificar el código (${error.code ?? "error"})`);
  return typeof data === "string" ? data : null;
}

// El código manual vigente del organizador (los equipos que entran con correo y contraseña se listan aparte). Uno vencido no cuenta.
export async function activeSyncToken(organizer: string): Promise<SyncTokenInfo | null> {
  const db = backend();
  if (!db) {
    for (const e of mem.values()) if (e.organizer === organizer && !isIdle(e)) return { createdAt: e.createdAt, lastUsedAt: e.lastUsedAt };
    return null;
  }
  if (!UUID.test(organizer)) return null;
  const { data, error } = await db.from("api_tokens").select("created_at, last_used_at").eq("organizer_id", organizer).eq("kind", "manual").is("revoked_at", null).maybeSingle();
  if (error) throw new Error(`No se pudo leer el código (${error.code ?? "error"})`);
  if (!data) return null;
  const info = { createdAt: data.created_at as string, lastUsedAt: (data.last_used_at as string | null) ?? null };
  return isIdle(info) ? null : info;
}

// Revoca el código manual activo sin generar otro (los equipos no se tocan). Deja de funcionar al instante.
export async function revokeSyncToken(organizer: string): Promise<void> {
  const db = backend();
  if (!db) {
    for (const [h, e] of mem) if (e.organizer === organizer) mem.delete(h);
    return;
  }
  if (!UUID.test(organizer)) return;
  const { error } = await db.from("api_tokens").update({ revoked_at: new Date().toISOString() }).eq("organizer_id", organizer).eq("kind", "manual").is("revoked_at", null);
  if (error) throw new Error(`No se pudo revocar el código (${error.code ?? "error"})`);
}
