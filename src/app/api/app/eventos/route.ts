import { organizerFromRequest } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { PAGE_SIZE, buildEventsPage, checkVersion, parseEventsQuery, type EventRow } from "@/lib/app-events";

// La app local descarga los eventos publicados y finalizados del organizador, con sus inscritos y el estado de pago (KIN-585).
// Contrato en docs/SYNC_API.md.
//   GET /api/app/eventos?since=<ISO>&cursor=<texto>      (encabezado opcional X-Contract-Version)
//   -> { contract_version, organizer, events: [...], next_cursor: string | null, generated_at: ISO }
// `since` devuelve solo los eventos que cambiaron desde esa fecha, y un cambio en sus inscripciones o categorías cuenta. Cada evento
// que cambió llega completo, con la lista vigente de inscritos. Guardar `generated_at` para el siguiente `since`.
// Orden de las comprobaciones: código de conexión (401/429), versión y parámetros (400/426), organizador activo (403).
// Los borradores no se envían. NUNCA se registran los nombres de los inscritos en logs.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const unavailable = () => json({ code: "service_unavailable", error: "Servicio no disponible" }, 503);

export async function GET(request: Request) {
  const auth = await organizerFromRequest(request);
  if (auth instanceof Response) return auth;

  const version = checkVersion(request.headers.get("x-contract-version"));
  if (version) return json({ code: version.code, error: version.error }, version.status);
  const parsed = parseEventsQuery(new URL(request.url));
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);
  const { since, cursor } = parsed.value;

  const db = adminClient();
  if (!db) return unavailable();

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) {
      return json({ code: organizer.status === 403 ? "organizer_not_active" : "service_unavailable", error: organizer.error }, organizer.status);
    }

    // Todas las páginas de una descarga comparten el mismo corte (`generated_at`): el de la primera.
    const snapshot = cursor?.snapshot ?? new Date().toISOString();
    const { data, error } = await db.rpc("app_organizer_events", {
      p_organizer: auth.organizer,
      p_since: since,
      p_snapshot: snapshot,
      p_after_changed: cursor?.changedAt ?? null,
      p_after_id: cursor?.id ?? null,
      p_limit: PAGE_SIZE + 1, // uno de más para saber si hay otra página
    });
    if (error) return unavailable();

    return json(buildEventsPage((data ?? []) as EventRow[], auth.organizer, snapshot));
  } catch {
    return unavailable();
  }
}
