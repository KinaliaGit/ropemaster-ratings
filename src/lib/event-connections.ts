import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { hashToken, isUuid, newEventToken, newInviteToken, type EventGrant, type Scope } from "@/lib/app-connection";

// Enlaces privados por evento (KIN-783). Todo pasa por funciones SQL que solo ejecuta el servidor (migración 0056); en la base queda SOLO
// el hash de la invitación y del token. La invitación en claro se entrega una vez al crearla y el token una vez al canjearla.

function db() {
  const client = adminClient();
  if (!client) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY: los enlaces de evento necesitan la base");
  return client;
}

export type CreateFailure = "not_found" | "not_published" | "invalid_scopes" | "limit" | "writer_exists";
const KNOWN: CreateFailure[] = ["not_found", "not_published", "invalid_scopes", "limit", "writer_exists"];

/** Crea la invitación de un evento del organizador. Devuelve la invitación en claro UNA vez, o el motivo por el que no se pudo. */
export async function createEventInvite(organizer: string, eventId: string, label: string, scopes: Scope[]): Promise<{ invite: string; id: string } | { failure: CreateFailure }> {
  if (!isUuid(organizer) || !isUuid(eventId)) return { failure: "not_found" };
  const invite = newInviteToken();
  const { data, error } = await db().rpc("create_event_connection", {
    p_organizer: organizer, p_event: eventId, p_invite_hash: hashToken(invite), p_label: label, p_scopes: scopes,
  });
  if (error) {
    const known = KNOWN.find((code) => (error.message ?? "").includes(code));
    if (known) return { failure: known };
    throw new Error(`No se pudo crear el enlace (${error.code ?? "error"})`);
  }
  return { invite, id: data as string };
}

export type Redeemed = { token: string; eventId: string; organizerId: string; scopes: string[]; expiresAt: string };

/** Canjea una invitación por el token del evento. null si no existe, ya se usó, venció, se revocó o el evento ya no está publicado. */
export async function redeemEventInvite(invite: string, device: string): Promise<Redeemed | null> {
  const token = newEventToken();
  const { data, error } = await db().rpc("redeem_event_connection", { p_invite_hash: hashToken(invite), p_token_hash: hashToken(token), p_device: device });
  if (error) throw new Error(`No se pudo canjear la invitación (${error.code ?? "error"})`);
  const row = (Array.isArray(data) ? data[0] : data) as { event_id: string; organizer_id: string; scopes: string[]; expires_at: string } | undefined;
  return row ? { token, eventId: row.event_id, organizerId: row.organizer_id, scopes: row.scopes, expiresAt: row.expires_at } : null;
}

export type EventTokenCheck = { organizer: string; grant: EventGrant; eventStatus: string };

/** Comprueba un token de evento. null si no existe, se revocó o venció (30 días sin uso o 7 días después de la fecha del evento). */
export async function verifyEventToken(raw: string): Promise<EventTokenCheck | null> {
  const { data, error } = await db().rpc("verify_event_token", { p_hash: hashToken(raw) });
  if (error) throw new Error(`No se pudo verificar el token (${error.code ?? "error"})`);
  const row = (Array.isArray(data) ? data[0] : data) as { organizer_id: string; event_id: string; scopes: string[]; event_status: string } | undefined;
  return row ? { organizer: row.organizer_id, grant: { eventId: row.event_id, scopes: row.scopes }, eventStatus: row.event_status } : null;
}

/** Cierre de sesión de la app con un token de evento: revoca solo ese enlace. */
export async function revokeEventTokenByToken(raw: string): Promise<boolean> {
  const { data, error } = await db().rpc("revoke_event_connection_by_token", { p_hash: hashToken(raw) });
  if (error) throw new Error(`No se pudo cerrar la sesión (${error.code ?? "error"})`);
  return data === true;
}

/** Revoca un enlace desde el panel. false si no existe, ya estaba revocado o es de otro organizador. */
export async function revokeEventConnection(organizer: string, id: string): Promise<boolean> {
  if (!isUuid(organizer) || !isUuid(id)) return false;
  const { data, error } = await db().rpc("revoke_event_connection", { p_organizer: organizer, p_id: id });
  if (error) throw new Error(`No se pudo revocar el enlace (${error.code ?? "error"})`);
  return data === true;
}

export type EventConnectionInfo = {
  id: string; eventId: string; eventName: string; label: string; scopes: string[]; state: "invited" | "connected";
  inviteExpiresAt: string; deviceName: string | null; createdAt: string; lastUsedAt: string | null; expiresAt: string | null;
};

const DAY = 86_400_000;

/** Enlaces ACTIVOS del organizador (invitaciones sin canjear vigentes y tokens vigentes), del más reciente al más antiguo. */
export async function listEventConnections(organizer: string): Promise<EventConnectionInfo[]> {
  if (!isUuid(organizer)) return [];
  const { data, error } = await db().from("event_connections")
    .select("id, event_id, label, scopes, invite_expires_at, redeemed_at, device_name, created_at, last_used_at, events(name, event_date)")
    .eq("organizer_id", organizer).is("revoked_at", null).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`No se pudo leer los enlaces (${error.code ?? "error"})`);
  const now = Date.now();
  const out: EventConnectionInfo[] = [];
  for (const row of (data ?? []) as unknown as Array<{
    id: string; event_id: string; label: string; scopes: string[]; invite_expires_at: string; redeemed_at: string | null; device_name: string | null;
    created_at: string; last_used_at: string | null; events: { name: string; event_date: string | null } | null;
  }>) {
    let expiresAt: string | null = null;
    if (row.redeemed_at) {
      // Misma regla que private.event_token_expires_at: 30 días sin uso y, a más tardar, a los 7 días de la fecha del evento.
      const idle = Date.parse(row.last_used_at ?? row.created_at) + 30 * DAY;
      const cap = row.events?.event_date ? Date.parse(`${row.events.event_date}T00:00:00Z`) + 8 * DAY : Infinity;
      const end = Math.min(idle, cap);
      if (end <= now) continue;
      expiresAt = new Date(end).toISOString();
    } else if (Date.parse(row.invite_expires_at) <= now) {
      continue;
    }
    out.push({
      id: row.id, eventId: row.event_id, eventName: row.events?.name ?? "", label: row.label, scopes: row.scopes,
      state: row.redeemed_at ? "connected" : "invited", inviteExpiresAt: row.invite_expires_at, deviceName: row.device_name,
      createdAt: row.created_at, lastUsedAt: row.last_used_at, expiresAt,
    });
  }
  return out;
}
