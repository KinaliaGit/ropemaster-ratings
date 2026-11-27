// Enlace privado por evento (KIN-783, H13.2): lógica pura, sin base de datos, para poder probarla con `node --test`
// (ver tests/app-connection.test.mjs). El contrato está en docs/SYNC_API.md y las decisiones en KIN-782.
//
// Cómo funciona: el organizador crea en su panel un enlace para UN evento publicado. El enlace lleva una invitación de un solo uso
// (`rmi_…`, vence a las 72 h). La app (o un operador) la canjea en POST /api/app/conexion y recibe un token de ese evento (`rme_…`).
// Ese token solo ve y escribe en su evento, y solo con los permisos que se le dieron. En la base solo quedan los hashes.

import { createHash, randomBytes } from "node:crypto";

export const SCOPES = ["event:read", "results:write", "payments:write"] as const;
export type Scope = (typeof SCOPES)[number];

export const INVITE_PREFIX = "rmi_";
export const EVENT_TOKEN_PREFIX = "rme_";
export const MAX_ACTIVE_LINKS = 5;      // enlaces activos por evento (lo aplica create_event_connection)
export const INVITE_HOURS = 72;         // vigencia de una invitación sin canjear
export const IDLE_DAYS = 30;            // un token vence tras estos días sin usarse...
export const AFTER_EVENT_DAYS = 7;      // ...y, a más tardar, a los 7 días de la fecha del evento
export const MAX_BODY_BYTES = 4 * 1024;
export const LABEL_MAX = 60;

/** Lo que un token de evento puede hacer. `null` en las rutas = sesión con correo y contraseña (sin límite de evento). */
export type EventGrant = { eventId: string; scopes: string[] };

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
export const newInviteToken = () => `${INVITE_PREFIX}${randomBytes(24).toString("base64url")}`;
export const newEventToken = () => `${EVENT_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
export const isEventToken = (raw: string) => raw.startsWith(EVENT_TOKEN_PREFIX);
export const isInviteToken = (raw: string) => raw.startsWith(INVITE_PREFIX);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store" };
const deny = (status: number, code: string, error: string) => Response.json({ code, error }, { status, headers });

/** Texto de la etiqueta de un enlace: sin caracteres de control, espacios colapsados, hasta 60 caracteres. Vacío: "Operador". */
export function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") return "Operador";
  const label = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX).trim();
  return label || "Operador";
}

/** Permisos pedidos en el formulario del panel: solo los conocidos; `event:read` siempre va. Devuelve null si trae uno desconocido. */
export function normalizeScopes(raw: unknown): Scope[] | null {
  const list = Array.isArray(raw) ? raw : [];
  const out = new Set<Scope>(["event:read"]);
  for (const item of list) {
    if (!(SCOPES as readonly unknown[]).includes(item)) return null;
    out.add(item as Scope);
  }
  return SCOPES.filter((s) => out.has(s));
}

/** Otro evento y uno inexistente se ven igual (404): un token de evento no revela qué más existe. */
export function guardEvent(grant: EventGrant | null, eventId: string): Response | null {
  if (!grant) return null;
  return grant.eventId === eventId.toLowerCase() ? null : deny(404, "event_not_found", "Evento no encontrado");
}

/** Sin el permiso: 403 `scope_denied`. Una sesión con correo y contraseña (grant null) tiene todos. */
export function guardScope(grant: EventGrant | null, scope: Scope): Response | null {
  if (!grant || grant.scopes.includes(scope)) return null;
  return deny(403, "scope_denied", "Este enlace no tiene permiso para esta acción.");
}

/** Cada resultado o pago de un lote debe ser del evento del token. Un lote con uno de otro evento se rechaza completo con 404. */
export function guardBatchEvent(grant: EventGrant | null, items: unknown[]): Response | null {
  if (!grant) return null;
  for (const item of items) {
    const id = typeof item === "object" && item !== null ? (item as Record<string, unknown>).event_id : undefined;
    if (typeof id !== "string" || id.toLowerCase() !== grant.eventId) return deny(404, "event_not_found", "Evento no encontrado");
  }
  return null;
}

export type ConnectFailure = { ok: false; status: 400 | 413 | 426; code: string; error: string };
export type ConnectInput = { ok: true; invite: string; device: unknown };
const fail = (status: ConnectFailure["status"], code: string, error: string): ConnectFailure => ({ ok: false, status, code, error });

/** Cuerpo de POST /api/app/conexion: { contract_version, invite, device_name? }. */
export function parseConnectBody(text: string, contractVersion: number): ConnectInput | ConnectFailure {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, "payload_too_large", "El cuerpo es demasiado grande.");
  let data: unknown;
  try { data = JSON.parse(text); } catch { return fail(400, "invalid_json", "El cuerpo no es un JSON válido."); }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fail(400, "invalid_body", "El cuerpo debe ser un objeto JSON.");
  const body = data as Record<string, unknown>;
  if (body.contract_version === undefined) return fail(400, "invalid_body", "Falta contract_version.");
  if (body.contract_version !== contractVersion) {
    return fail(426, "version_unsupported", `Esta web habla la versión ${contractVersion} del contrato. Actualiza la app.`);
  }
  if (typeof body.invite !== "string") return fail(400, "invalid_field", "invite debe ser texto.");
  const invite = body.invite.trim();
  if (!isInviteToken(invite) || invite.length < 20 || invite.length > 100) return fail(400, "invalid_field", "La invitación no tiene el formato esperado.");
  return { ok: true, invite, device: body.device_name };
}

/** Extrae la invitación de lo que pegó el operador: el enlace completo (`…#rmi_…`, `…?invite=rmi_…`) o solo el código. */
export function inviteFromLink(raw: string): string | null {
  const match = raw.match(/rmi_[A-Za-z0-9_-]{16,80}/);
  return match ? match[0] : null;
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
