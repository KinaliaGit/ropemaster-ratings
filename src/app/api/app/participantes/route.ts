import { organizerFromRequest } from "@/lib/app-auth";
import { guardEvent, guardScope } from "@/lib/app-connection";
import { adminClient } from "@/lib/supabase/admin";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { INITIAL_RATING } from "@/lib/rating";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { PAGE_SIZE, buildPage, parseParticipantsQuery, type ParticipantRow } from "@/lib/app-participants";

// Participantes de UN evento del organizador para la app local (KIN-586).
//
// La sincronización es SIEMPRE por evento: `event_id` es obligatorio y no existe un modo "todo el directorio". Solo se devuelven las
// personas inscritas en ese evento, con su correo (la identidad en la web), si ya reclamaron su perfil y su rating por modalidad.
// Orden de las comprobaciones: token de la sesión (401/429), parámetros (400), organizador activo (403), evento suyo (404).
//   GET /api/app/participantes?event_id=<uuid>&since=<ISO>&cursor=<texto>
//   -> { participants: [...], next_cursor: string | null, generated_at: ISO }
// NUNCA se registran los correos en logs.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  const auth = await organizerFromRequest(request, { eventToken: true });
  if (auth instanceof Response) return auth;
  const noScope = guardScope(auth.grant, "event:read");
  if (noScope) return noScope;

  const parsed = parseParticipantsQuery(new URL(request.url));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { eventId, since, cursor } = parsed.value;
  const otherEvent = guardEvent(auth.grant, eventId); // un token de evento solo lee a los inscritos de su evento
  if (otherEvent) return otherEvent;

  const db = adminClient();
  if (!db) return json({ error: "Servicio no disponible" }, 503);

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) return json({ error: organizer.error }, organizer.status);

    // Solo de eventos propios. Uno ajeno y uno inexistente se ven igual (404) para no revelar cuáles existen.
    const event = await db.from("events").select("id, organizer_id").eq("id", eventId).maybeSingle();
    if (event.error) return json({ error: "Servicio no disponible" }, 503);
    if (!event.data || event.data.organizer_id !== auth.organizer) return json({ error: "Evento no encontrado" }, 404);

    // Todas las páginas de una descarga comparten el mismo corte (`generated_at`): el de la primera.
    const snapshot = cursor?.snapshot ?? new Date().toISOString();
    const { data, error } = await db.rpc("app_event_participants", {
      p_event: eventId,
      p_since: since,
      p_snapshot: snapshot,
      p_after_changed: cursor?.changedAt ?? null,
      p_after_id: cursor?.id ?? null,
      p_limit: PAGE_SIZE + 1, // uno de más para saber si hay otra página
    });
    if (error) return json({ error: "Servicio no disponible" }, 503);

    const rows = (data ?? []) as ParticipantRow[];
    // ID corto de cada persona de la página (KIN-752). Si no se pudo leer, la página sale igual con `short_id: null`: es un dato extra.
    const shortIds: Record<string, string> = {};
    if (rows.length) {
      const found = await db.from("ropers").select("id, short_id").in("id", rows.slice(0, PAGE_SIZE).map((r) => r.global_id));
      for (const r of found.data ?? []) if (r.short_id) shortIds[r.id] = r.short_id;
    }
    return json(buildPage(rows, snapshot, ACTIVE_DISCIPLINES.map((d) => d.id), INITIAL_RATING, shortIds));
  } catch {
    return json({ error: "Servicio no disponible" }, 503);
  }
}
