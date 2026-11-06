import { createHash, timingSafeEqual } from "node:crypto";
import { verifySyncToken } from "@/lib/sync-tokens";
import { adminClient } from "@/lib/supabase/admin";

// Autentica a la app local por código de conexión (Authorization: Bearer ...).
// El organizador lo genera en su panel; aquí se compara su hash contra la base (api_tokens), ver sync-tokens.ts.
// APP_SYNC_TOKEN (opcional) sirve como código fijo SOLO para pruebas locales: en producción se ignora.

const MAX_FAILURES = 20;     // intentos con un código inválido permitidos por IP...
const WINDOW_SECONDS = 300;  // ...dentro de esta ventana (5 minutos)

// IP del cliente. En Vercel x-forwarded-for lo pone la plataforma; en otro hosting hay que confirmar que un cliente no pueda inventarlo.
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
const ipHash = (ip: string) => createHash("sha256").update(ip).digest("hex");

// Respaldo en memoria para desarrollo sin llave de servicio.
const g = globalThis as unknown as { __rmFailures?: Map<string, number[]> };
const memFailures = (g.__rmFailures ??= new Map<string, number[]>());
const recent = (h: string) => {
  const cutoff = Date.now() - WINDOW_SECONDS * 1000;
  const list = (memFailures.get(h) ?? []).filter((t) => t > cutoff);
  memFailures.set(h, list);
  return list;
};

async function isBlocked(h: string): Promise<boolean> {
  const db = adminClient();
  if (!db) return recent(h).length >= MAX_FAILURES;
  const { data, error } = await db.rpc("api_auth_is_blocked", { p_ip_hash: h, p_limit: MAX_FAILURES, p_window_seconds: WINDOW_SECONDS });
  return !error && data === true; // si el conteo falla no se bloquea a nadie; la verificación del código sigue protegida
}

async function recordFailure(h: string): Promise<void> {
  const db = adminClient();
  if (!db) { recent(h).push(Date.now()); return; }
  await db.rpc("api_auth_record_failure", { p_ip_hash: h });
}

function fixedTokenMatches(given: string) {
  const fixed = process.env.APP_SYNC_TOKEN;
  if (!fixed || process.env.NODE_ENV === "production") return false;
  const a = Buffer.from(given), b = Buffer.from(fixed);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function organizerFromRequest(request: Request): Promise<{ organizer: string } | Response> {
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!given) return Response.json({ error: "Token inválido" }, { status: 401 });

  const h = ipHash(clientIp(request));
  try {
    if (await isBlocked(h)) {
      return Response.json({ error: "Demasiados intentos" }, { status: 429, headers: { "Retry-After": String(WINDOW_SECONDS) } });
    }
    const organizer = await verifySyncToken(given);
    if (organizer) return { organizer };
    if (fixedTokenMatches(given)) return { organizer: process.env.APP_SYNC_ORGANIZER ?? "Rodeo Norte" };
    await recordFailure(h);
    return Response.json({ error: "Token inválido" }, { status: 401 });
  } catch {
    // Falla de la base: la app debe reintentar luego (5xx), no tratarlo como código inválido. No se registra el código.
    return Response.json({ error: "Servicio no disponible" }, { status: 503 });
  }
}
