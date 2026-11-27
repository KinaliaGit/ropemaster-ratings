import { clientIp } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { CONTRACT_VERSION } from "@/lib/app-results";
import { LOGIN_LIMITS, cleanDeviceName } from "@/lib/app-login";
import { IDLE_DAYS, MAX_BODY_BYTES, hashToken, parseConnectBody } from "@/lib/app-connection";
import { redeemEventInvite } from "@/lib/event-connections";

// La app (o un operador) canjea la invitación de un evento por el token de ESE evento (KIN-783, H13.2). Contrato en docs/SYNC_API.md.
//   POST /api/app/conexion  { contract_version, invite, device_name? }     (sin Authorization: la invitación es la credencial)
//   -> 200 { contract_version, token, event: { id, name }, organizer: { id, name }, scopes, expires_at, idle_days, device_name }
// La invitación es de un solo uso y vence a las 72 h; el token se muestra UNA vez y en la base solo queda su hash. Con él la app descarga
// ese evento y sube lo que sus permisos (`scopes`) permiten; con otro evento responde 404 y sin permiso 403 `scope_denied`.
// Orden de las comprobaciones: tamaño (413), cuerpo y versión (400/426), límite de intentos (429), invitación (401). Una invitación
// desconocida, usada, vencida, revocada o de un evento que ya no está publicado se ven igual (401 `invalid_invite`) y gastan el límite.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
const unavailable = () => json({ code: "service_unavailable", error: "Servicio no disponible" }, 503);

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ code: "payload_too_large", error: "El cuerpo es demasiado grande." }, 413);
  }
  const parsed = parseConnectBody(await request.text(), CONTRACT_VERSION);
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return unavailable();

  const key = `connect:ip:${hashToken(clientIp(request))}`;
  const { limit, windowSeconds } = LOGIN_LIMITS.ip;
  try {
    const blocked = await db.rpc("api_auth_is_blocked", { p_ip_hash: key, p_limit: limit, p_window_seconds: windowSeconds });
    if (!blocked.error && blocked.data === true) {
      return json({ code: "rate_limited", error: "Demasiados intentos. Espera unos minutos." }, 429, { "Retry-After": String(windowSeconds) });
    }

    const deviceName = cleanDeviceName(parsed.device);
    const redeemed = await redeemEventInvite(parsed.invite, deviceName);
    if (!redeemed) {
      await db.rpc("api_auth_record_failure", { p_ip_hash: key });
      return json({ code: "invalid_invite", error: "La invitación no sirve: ya se usó, venció o el organizador la revocó. Pide otra." }, 401);
    }

    const [event, profile] = await Promise.all([
      db.from("events").select("name").eq("id", redeemed.eventId).maybeSingle(),
      db.from("profiles").select("display_name").eq("user_id", redeemed.organizerId).maybeSingle(),
    ]);
    return json({
      contract_version: CONTRACT_VERSION, token: redeemed.token,
      event: { id: redeemed.eventId, name: event.data?.name ?? "" },
      organizer: { id: redeemed.organizerId, name: profile.data?.display_name ?? "" },
      scopes: redeemed.scopes, expires_at: redeemed.expiresAt, idle_days: IDLE_DAYS, device_name: deviceName,
    });
  } catch {
    return unavailable(); // no se registra la invitación ni el token
  }
}
