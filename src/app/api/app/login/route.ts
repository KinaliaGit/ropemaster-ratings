import type { SupabaseClient } from "@supabase/supabase-js";
import { clientIp } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { CONTRACT_VERSION } from "@/lib/app-results";
import { LOGIN_LIMITS, MAX_BODY_BYTES, MAX_DEVICES, classifyAuthError, emailKey, ipKey, parseLoginBody } from "@/lib/app-login";
import { IDLE_DAYS, createDeviceToken } from "@/lib/sync-tokens";

// La app local entra con el correo y la contraseña de la cuenta de organizador de la web (KIN-606). Contrato en docs/SYNC_API.md.
//   POST /api/app/login  { contract_version, email, password, device_name? }
//   -> 200 { contract_version, token, organizer: { id, name }, device_name, max_devices, idle_days }
// La web entrega un token propio para ESE equipo (se muestra una sola vez; en la base solo queda su hash) y la app lo guarda en el
// llavero del sistema. La contraseña no se guarda ni se escribe en registros. El resto de endpoints no cambia: usan ese token como
// el código de conexión de siempre, así que sin internet la app sigue capturando y solo la sincronización lo necesita.
// Orden de las comprobaciones: tamaño (413), cuerpo y versión (400/426), límite de intentos (429), contraseña (401/403/429),
// organizador activo (403), límite de equipos (409). Cada respuesta de error lleva `code`.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
const unavailable = () => json({ code: "service_unavailable", error: "Servicio no disponible" }, 503);

type Limit = { limit: number; windowSeconds: number };

// Si el conteo falla no se bloquea a nadie: la contraseña sigue protegida por Supabase Auth.
async function isBlocked(db: SupabaseClient, key: string, { limit, windowSeconds }: Limit) {
  const { data, error } = await db.rpc("api_auth_is_blocked", { p_ip_hash: key, p_limit: limit, p_window_seconds: windowSeconds });
  return !error && data === true;
}
const recordFailure = (db: SupabaseClient, key: string) => db.rpc("api_auth_record_failure", { p_ip_hash: key });

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ code: "payload_too_large", error: "El cuerpo es demasiado grande." }, 413);
  }
  const parsed = parseLoginBody(await request.text(), CONTRACT_VERSION);
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return unavailable();

  const byIp = ipKey(clientIp(request)), byEmail = emailKey(parsed.email);
  try {
    if ((await isBlocked(db, byIp, LOGIN_LIMITS.ip)) || (await isBlocked(db, byEmail, LOGIN_LIMITS.email))) {
      return json({ code: "rate_limited", error: "Demasiados intentos. Espera unos minutos." }, 429, { "Retry-After": String(LOGIN_LIMITS.email.windowSeconds) });
    }

    // Cliente SIN sesión guardada: Supabase Auth solo comprueba la contraseña; la web no abre una sesión de navegador para la app.
    const auth = createPublicClient();
    const { data, error } = await auth.auth.signInWithPassword({ email: parsed.email, password: parsed.password });
    if (error || !data.user) {
      const kind = error ? classifyAuthError(error) : "invalid_credentials";
      if (kind === "invalid_credentials") {
        // Mismo mensaje para "no existe" y "contraseña mala": no se revela qué correos tienen cuenta. Solo los fallos gastan el límite.
        await Promise.all([recordFailure(db, byIp), recordFailure(db, byEmail)]);
        return json({ code: "invalid_credentials", error: "Correo o contraseña incorrectos." }, 401);
      }
      if (kind === "email_not_confirmed") return json({ code: "email_not_confirmed", error: "Confirma tu correo antes de entrar." }, 403);
      if (kind === "rate_limited") return json({ code: "rate_limited", error: "Demasiados intentos. Espera unos minutos." }, 429, { "Retry-After": "60" });
      return unavailable();
    }
    const userId = data.user.id;
    // La sesión de Supabase solo sirvió para comprobar la contraseña: se revoca para que no quede una sesión suelta.
    await auth.auth.signOut({ scope: "local" }).catch(() => undefined);

    const organizer = await checkActiveOrganizer(db, userId);
    if (!organizer.ok) {
      return json({ code: organizer.status === 403 ? "organizer_not_active" : "service_unavailable", error: organizer.error }, organizer.status);
    }

    const created = await createDeviceToken(userId, parsed.deviceName);
    if ("limit" in created) {
      return json({
        code: "device_limit", max_devices: MAX_DEVICES,
        error: `Ya hay ${MAX_DEVICES} equipos conectados a esta cuenta. Revoca uno desde tu panel en la web (App local) y vuelve a intentar.`,
      }, 409);
    }

    const profile = await db.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
    return json({
      contract_version: CONTRACT_VERSION, token: created.code, organizer: { id: userId, name: profile.data?.display_name ?? "" },
      device_name: parsed.deviceName, max_devices: MAX_DEVICES, idle_days: IDLE_DAYS,
    });
  } catch {
    return unavailable(); // no se registra nada del intento: ni correo ni contraseña
  }
}
