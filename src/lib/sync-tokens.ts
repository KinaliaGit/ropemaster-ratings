import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { MAX_DEVICES } from "@/lib/app-login";

// Tokens de sesión de la app local (KIN-606): uno por equipo que entró con correo y contraseña. En la base (api_tokens) se guarda SOLO el
// hash sha256; el token en claro se entrega una vez al iniciar sesión y nunca se escribe en la base ni en los registros del servidor.
// Todo usa la base con SUPABASE_SERVICE_ROLE_KEY. Ya no hay códigos de conexión que se peguen a mano (KIN-631).

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const newToken = () => `rm_${randomBytes(24).toString("base64url")}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Un token vence tras estos días sin usarse (la creación cuenta como primer uso). En la base lo decide api_token_idle_days() (0025);
// este número solo lo usa el respaldo en memoria, que debe comportarse igual.
export const IDLE_DAYS = 30;
const isIdle = (t: { createdAt: string; lastUsedAt: string | null }) => Date.parse(t.lastUsedAt ?? t.createdAt) < Date.now() - IDLE_DAYS * 86_400_000;

function backend() {
  const db = adminClient();
  if (db) return db;
  if (process.env.NODE_ENV === "production") throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY: los tokens de la app no se pueden guardar");
  return null;
}

// Devuelve el organizador dueño del token de un equipo, o null si no existe, fue revocado o venció por inactividad. Sin la llave de
// servicio (solo desarrollo) no hay tokens que verificar.
// En la base lo decide verify_api_token (0025): también reinicia el plazo y anota el último uso.
export async function verifySyncToken(raw: string): Promise<string | null> {
  const db = backend();
  if (!db) return null;
  const { data, error } = await db.rpc("verify_api_token", { p_hash: hash(raw) });
  if (error) throw new Error(`No se pudo verificar el token (${error.code ?? "error"})`);
  return typeof data === "string" ? data : null;
}

// --- Equipos que entraron con correo y contraseña (KIN-606): un token por equipo, hasta MAX_DEVICES. Solo con la base.

export type DeviceInfo = { id: string; name: string; createdAt: string; lastUsedAt: string | null; expiresAt: string; expired: boolean };

function requireDb() {
  const db = backend();
  if (!db) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY: el inicio de sesión de la app necesita la base");
  return db;
}

// Crea el token del equipo. Devuelve el token en claro UNA vez, o `limit` si el organizador ya tiene MAX_DEVICES equipos activos
// (no cierra ninguno: que el organizador elija cuál revocar).
export async function createDeviceToken(organizer: string, name: string): Promise<{ token: string } | { limit: true }> {
  if (!UUID.test(organizer)) throw new Error("El organizador no tiene una cuenta real todavía");
  const raw = newToken();
  const { data, error } = await requireDb().rpc("create_device_token", { p_organizer: organizer, p_hash: hash(raw), p_name: name, p_max: MAX_DEVICES });
  if (error) throw new Error(`No se pudo guardar el equipo (${error.code ?? "error"})`);
  return data ? { token: raw } : { limit: true };
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
export async function revokeTokenByToken(raw: string): Promise<boolean> {
  const { data, error } = await requireDb().rpc("revoke_api_token_by_hash", { p_hash: hash(raw) });
  if (error) throw new Error(`No se pudo cerrar la sesión (${error.code ?? "error"})`);
  return data === true;
}
