import { organizerFromRequest } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { closeResponse, isUuid, parseCloseBody } from "@/lib/app-results";

// La app cierra los resultados de un evento (KIN-587): pasa a `finalizado` y se pone el candado de los resultados.
//   POST /api/app/eventos/<event_id>/cierre  { contract_version, expected_results }
// `expected_results` es cuántos resultados tiene la app. Si la web tiene otra cantidad: 409 `incomplete` y NO se cierra (para no
// dejar resultados a medias). Cerrar uno ya cerrado es inofensivo. Un evento ajeno o inexistente es 404 (no se distingue).
// Aquí se conectará el recálculo de ratings cuando exista (KIN-571 y KIN-583, en pausa).
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request, ctx: RouteContext<"/api/app/eventos/[id]/cierre">) {
  const auth = await organizerFromRequest(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: "El id del evento no es válido." }, 400);
  const parsed = parseCloseBody(await request.text());
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return json({ error: "Servicio no disponible" }, 503);

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) return json({ error: organizer.error }, organizer.status);

    const { data, error } = await db.rpc("app_close_event_results", { p_organizer: auth.organizer, p_event: id.toLowerCase(), p_expected: parsed.expected });
    const row = (data as { outcome: string; results_count: number | null }[] | null)?.[0];
    if (error || !row) return json({ error: "Servicio no disponible" }, 503);
    const result = closeResponse(row.outcome, id.toLowerCase(), row.results_count);
    return json(result.body, result.status);
  } catch {
    return json({ error: "Servicio no disponible" }, 503);
  }
}
