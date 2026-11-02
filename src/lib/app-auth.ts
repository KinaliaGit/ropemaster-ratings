import { timingSafeEqual } from "node:crypto";

// Autentica a la app local por token de organizador (Authorization: Bearer ...).
// DEMO: un solo token por variable de entorno. Producción: tabla api_tokens guardando el HASH del token
// (ver supabase/migrations/0003_sync_app.sql); el token se muestra una sola vez al organizador.
export function organizerFromRequest(request: Request): { organizer: string } | Response {
  const expected = process.env.APP_SYNC_TOKEN;
  if (!expected) return Response.json({ error: "Sincronización no configurada" }, { status: 503 });
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Token inválido" }, { status: 401 });
  return { organizer: process.env.APP_SYNC_ORGANIZER ?? "Rodeo Norte" };
}
