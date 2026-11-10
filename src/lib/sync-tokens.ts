import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { MAX_DEVICES } from "@/lib/app-login";

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
export const IDLE_DAYS = 30;
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

// --- Equipos que entraron con correo y contraseña (KIN-606): un token por equipo, hasta MAX_DEVICES. Solo con la base (sin respaldo en memoria).

export type DeviceInfo = { id: string; name: string; createdAt: string; lastUsedAt: string | null; expiresAt: string; expired: boolean };

function requireDb() {
  const db = backend();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY: el inicio de sesión de la app necesita la base");
  return db;
}

// Crea el token del equipo. Devuelve el código en claro UNA vez, o `limit` si el organizador ya tiene MAX_DEVICES equipos activos
// (no cierra ninguno: que el organizador elija cuál revocar).
export async function createDeviceToken(organizer: string, name: string): Promise<{ code: string } | { limit: true }> {
  if (!UUID.test(organizer)) throw new Error("El organizador no tiene una cuenta real todavía");
  const raw = newCode();
  const { data, error } = await requireDb().rpc("create_device_token", { p_organizer: organizer, p_hash: hash(raw), p_name: name, p_max: MAX_DEVICES });
  if (error) throw new Error(`No se pudo guardar el equipo (${error.code ?? "error"})`);
  return data ? { code: raw } : { limit: true };
}

// Equipos conectados (no revocados), del más reciente al más antiguo. Uno que ya venció por inactividad sale marcado, no oculto.
export async function listDevices(organizer: string): Promise<DeviceInfo[]> {
  if (!UUID.test(organizer)) return [];
  const { data, error } = await requireDb().from("api_tokens").select("id, name, created_at, last_used_at")
    .eq("organizer_id", organizer).eq("kind", "login").is("revoked_at", null).order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudo leer los equipos (${error.code ?? "error"})`);
  return (data ?? []).map((row) => {
    const createdAt = row.created_at as string, lastUsedAt = (row.last_used_at as string | null) ?? null;
    const expiresAt = new Date(Date.parse(lastUsedAt ?? createdAt) + IDLE_DAYS * 86_400_000).toISOString();
    return { id: row.id as string, name: row.name as string, createdAt, lastUsedAt, expiresAt, expired: isIdle({ createdAt, lastUsedAt }) };
  });
}

// Revoca un equipo del organizador (desde su panel). false si no existe, ya estaba revocado o es de otro organizador.
export async function revokeDevice(organizer: string, id: string): Promise<boolean> {
  if (!UUID.test(organizer) || !UUID.test(id)) return false;
  const { data, error } = await requireDb().rpc("revoke_api_token", { p_organizer: organizer, p_id: id });
  if (error) throw new Error(`No se pudo revocar el equipo (${error.code ?? "error"})`);
  return data === true;
}

// Cierre de sesión de la app: revoca el token que se usó, venza o no. false si ya no existía. No dice de quién era.
export async function revokeTokenByCode(raw: string): Promise<boolean> {
  const { data, error } = await requireDb().rpc("revoke_api_token_by_hash", { p_hash: hash(raw) });
  if (error) throw new Error(`No se pudo cerrar la sesión (${error.code ?? "error"})`);
  return data === true;
}
