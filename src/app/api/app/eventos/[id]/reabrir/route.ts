import { organizerFromRequest } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { isUuid, parseReopenBody, reopenResponse } from "@/lib/app-results";

// La app reabre los resultados de un evento cerrado para corregirlos (KIN-587). Se hace DESDE LA APP: al desbloquear un evento
// finalizado se pide el motivo, y la app reabre, reenvía lo corregido y cierra otra vez.
//   POST /api/app/eventos/<event_id>/reabrir  { contract_version, reason }
// El motivo es obligatorio y queda en la bitácora. Reabrir quita el candado de los resultados y NO cambia el estado del evento:
// sigue `finalizado`, porque en la web `publicado` es lo que permite inscribirse. Reabrir uno ya abierto es inofensivo.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request, ctx: RouteContext<"/api/app/eventos/[id]/reabrir">) {
  const auth = await organizerFromRequest(request);
  if (auth instanceof Response) return auth;

  const { id } = await ctx.params;
  if (!isUuid(id)) return json({ error: "El id del evento no es válido." }, 400);
  const parsed = parseReopenBody(await request.text());
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return json({ error: "Servicio no disponible" }, 503);

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) return json({ error: organizer.error }, organizer.status);

    const { data, error } = await db.rpc("app_reopen_event_results", { p_organizer: auth.organizer, p_event: id.toLowerCase(), p_reason: parsed.reason });
    const row = (data as { outcome: string; results_count: number | null }[] | null)?.[0];
    if (error || !row) return json({ error: "Servicio no disponible" }, 503);
    const result = reopenResponse(row.outcome, id.toLowerCase());
    return json(result.body, result.status);
  } catch {
    return json({ error: "Servicio no disponible" }, 503);
  }
}
