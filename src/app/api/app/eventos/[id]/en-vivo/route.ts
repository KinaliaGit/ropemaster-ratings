import { organizerFromRequest } from "@/lib/app-auth";
import { guardEvent, guardScope } from "@/lib/app-connection";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { isUuid } from "@/lib/app-results";
import { liveResponse, parseLiveBody } from "@/lib/app-live";

// La app manda la foto de la ronda que se está corriendo (KIN-787, H13.6). Contrato en docs/SYNC_API.md ("Resultados en vivo").
//   POST /api/app/eventos/<event_id>/en-vivo  { contract_version, revision, round, rounds, total, done, current, pending, standings }
//   -> 200 { contract_version, event_id, revision, unchanged }  |  409 stale_revision (la web ya tiene una más nueva)  |  404
// Una fila por evento: cada foto reemplaza a la anterior. Reenviar la misma revisión es inofensivo. Necesita `results:write`; un token de otro evento es 404.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request, ctx: RouteContext<"/api/app/eventos/[id]/en-vivo">) {
  const auth = await organizerFromRequest(request, { eventToken: true });
  if (auth instanceof Response) return auth;
  const noScope = guardScope(auth.grant, "results:write");
  if (noScope) return noScope;

  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: "El id del evento no es válido." }, 400);
  const otherEvent = guardEvent(auth.grant, id);
  if (otherEvent) return otherEvent;
  const parsed = parseLiveBody(await request.text());
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return json({ error: "Servicio no disponible" }, 503);

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) return json({ error: organizer.error }, organizer.status);

    const { data, error } = await db.rpc("app_put_live_snapshot", {
      p_organizer: auth.organizer,
      p_event: id.toLowerCase(),
      p_revision: parsed.revision,
      p_snapshot: parsed.snapshot,
    });
    const row = (data as { outcome: string; revision: number | string | null }[] | null)?.[0];
    if (error || !row) return json({ error: "Servicio no disponible" }, 503);
    const result = liveResponse(row.outcome, id.toLowerCase(), row.revision === null ? null : Number(row.revision));
    return json(result.body, result.status);
  } catch {
    return json({ error: "Servicio no disponible" }, 503);
  }
}
