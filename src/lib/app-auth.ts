import { timingSafeEqual } from "node:crypto";
import { verifySyncToken } from "@/lib/sync-tokens";

// Autentica a la app local por código de conexión (Authorization: Bearer ...).
// El código lo genera el organizador en su panel; aquí solo se compara su hash.
// APP_SYNC_TOKEN (opcional) sirve como código fijo para pruebas locales.
export function organizerFromRequest(request: Request): { organizer: string } | Response {
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!given) return Response.json({ error: "Token inválido" }, { status: 401 });

  const organizer = verifySyncToken(given);
  if (organizer) return { organizer };

  const fixed = process.env.APP_SYNC_TOKEN;
  if (fixed) {
    const a = Buffer.from(given), b = Buffer.from(fixed);
    if (a.length === b.length && timingSafeEqual(a, b)) return { organizer: process.env.APP_SYNC_ORGANIZER ?? "Rodeo Norte" };
  }
  return Response.json({ error: "Token inválido" }, { status: 401 });
}
