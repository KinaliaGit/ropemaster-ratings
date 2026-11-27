import { adminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/app-results";
import { etagMatches, liveEtag, toLiveSnapshot, type LiveRow } from "@/lib/app-live";

// Lectura PÚBLICA de la foto en vivo de un evento (KIN-787, H13.6). La página la sondea cada 10-15 s.
//   GET /api/eventos/<event_id>/en-vivo  ->  200 LiveSnapshot + ETag  |  304 (sin cambios)  |  404 (sin foto, borrador, privado o inexistente)
// Solo contesta por eventos publicados o finalizados y públicos (lo decide `get_live_snapshot`); nunca trae correos, celulares ni pagos.
// El ETag es la revisión: el 304 es barato y la CDN puede servir la misma respuesta unos segundos a todos los espectadores.
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[id]/en-vivo">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Evento no encontrado" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const db = adminClient();
  if (!db) return Response.json({ error: "Servicio no disponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const { data, error } = await db.rpc("get_live_snapshot", { p_event: id.toLowerCase() });
  if (error) return Response.json({ error: "Servicio no disponible" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const row = (data as LiveRow[] | null)?.[0];
  if (!row) return Response.json({ error: "Evento no encontrado" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } });

  const etag = liveEtag(row.revision);
  const cache = { ETag: etag, "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" };
  if (etagMatches(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: cache });
  return Response.json(toLiveSnapshot(row), { headers: cache });
}
