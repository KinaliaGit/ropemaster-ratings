import { revokeTokenByCode } from "@/lib/sync-tokens";

// Cierre de sesión de la app (KIN-606): revoca el token con el que se llama, y solo ese equipo. Contrato en docs/SYNC_API.md.
//   POST /api/app/logout   (Authorization: Bearer <token>)  ->  200 { ok: true, revoked: boolean }
// Es idempotente: un token que ya estaba revocado, vencido o que no existe también devuelve 200 con `revoked: false`, para que la app
// pueda olvidar su token local sin distinguir. No dice de quién era el token. La app lo llama al desconectar si hay internet; sin
// internet solo olvida el token local, y la web lo dejará vencer a los 30 días sin uso o se revoca desde el panel.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!given) return json({ code: "invalid_token", error: "Token inválido" }, 401);
  try {
    return json({ ok: true, revoked: await revokeTokenByCode(given) });
  } catch {
    return json({ code: "service_unavailable", error: "Servicio no disponible" }, 503);
  }
}
