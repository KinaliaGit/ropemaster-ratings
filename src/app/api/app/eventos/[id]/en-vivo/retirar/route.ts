import { organizerFromRequest } from "@/lib/app-auth";
import { guardEvent, guardScope } from "@/lib/app-connection";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { isUuid } from "@/lib/app-results";
import { CONTRACT_VERSION } from "@/lib/app-live";

// La app apagó «En vivo web» de un evento: se retira la última foto para que la página pública no muestre una ronda congelada (KIN-787).
//   POST /api/app/eventos/<event_id>/en-vivo/retirar  (sin cuerpo necesario)
//   -> 200 { contract_version, event_id, removed }  |  404 (evento inexistente o de otro organizador)
// Necesita `results:write`; un token de otro evento es 404. Retirar un evento sin foto es inofensivo (removed: false).
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request, ctx: RouteContext<"/api/app/eventos/[id]/en-vivo/retirar">) {
  const auth = await organizerFromRequest(request, { eventToken: true });
  if (auth instanceof Response) return auth;
  const noScope = guardScope(auth.grant, "results:write");
  if (noScope) return noScope;

  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: "El id del evento no es válido." }, 400);
  const otherEvent = guardEvent(auth.grant, id);
  if (otherEvent) return otherEvent;

  const db = adminClient();
  if (!db) return json({ error: "Servicio no disponible" }, 503);

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) return json({ error: organizer.error }, organizer.status);

    const { data, error } = await db.rpc("app_delete_live_snapshot", { p_organizer: auth.organizer, p_event: id.toLowerCase() });
    const row = (data as { outcome: string }[] | null)?.[0];
    if (error || !row) return json({ error: "Servicio no disponible" }, 503);
    if (row.outcome === "not_found") return json({ error: "Evento no encontrado" }, 404);
    return json({ contract_version: CONTRACT_VERSION, event_id: id.toLowerCase(), removed: row.outcome === "removed" });
  } catch {
    return json({ error: "Servicio no disponible" }, 503);
  }
}
