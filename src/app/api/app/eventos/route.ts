import { organizerFromRequest } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { MAX_BYTES, buildUploadEventResponse, dbFailure, parseUploadEventBody, type UploadEventRow } from "@/lib/app-event-upload";
import { PAGE_SIZE, buildEventsPage, checkVersion, parseEventsQuery, type EventRow, type EventSeriesRef } from "@/lib/app-events";

// La app local descarga los eventos publicados y finalizados del organizador, con sus inscritos y el estado de pago (KIN-585).
// Contrato en docs/SYNC_API.md.
//   GET /api/app/eventos?since=<ISO>&cursor=<texto>      (encabezado opcional X-Contract-Version)
//   -> { contract_version, organizer, events: [...], next_cursor: string | null, generated_at: ISO }
// `since` devuelve solo los eventos que cambiaron desde esa fecha, y un cambio en sus inscripciones o categorías cuenta. Cada evento
// que cambió llega completo, con la lista vigente de inscritos. Guardar `generated_at` para el siguiente `since`.
// Orden de las comprobaciones: token de la sesión (401/429), versión y parámetros (400/426), organizador activo (403).
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

    const rows = (data ?? []) as EventRow[];
    // El rating máximo para inscribirse (KIN-638), el tipo de sorteo con sus campos (KIN-649) y la serie del evento (KIN-625) se leen aparte para no tocar la función SQL de la
    // sincronización. La serie viaja con datos públicos (id, slug, nombre y fechas); la plantilla y las instrucciones de pago no salen.
    const page = rows.slice(0, PAGE_SIZE);
    if (page.length > 0) {
      const { data: extras, error: extrasError } = await db
        .from("events")
        .select("id, max_roper_rating, draw_type, lazada_shots_per_package, max_team_rating, rounds, series:event_series(id, slug, name, start_date, end_date)")
        .in("id", page.map((row) => row.id));
      if (extrasError) return unavailable();
      const byId = new Map((extras ?? []).map((row) => [row.id as string, row as unknown as Pick<EventRow, "max_roper_rating" | "draw_type" | "lazada_shots_per_package" | "max_team_rating" | "rounds"> & { series: EventSeriesRef | null }]));
      for (const row of page) {
        const extra = byId.get(row.id);
        row.max_roper_rating = extra?.max_roper_rating ?? null;
        row.draw_type = extra?.draw_type ?? "round_robin";
        row.lazada_shots_per_package = extra?.lazada_shots_per_package ?? null;
        row.max_team_rating = extra?.max_team_rating ?? null;
        row.rounds = extra?.rounds ?? null;
        row.series = byId.get(row.id)?.series ?? null;
      }
    }
    return json(buildEventsPage(rows, auth.organizer, snapshot));
  } catch {
    return unavailable();
  }
}

// La app crea un evento (y su serie) y lo sube (KIN-648, entrega 2). Contrato en docs/SYNC_API.md.
//   POST /api/app/eventos  { contract_version, event: {...}, series: {...} | null }
//   -> 201 (creado) o 200 (ya existía, no se modifica) { contract_version, created, event: { id, slug, status: "borrador" }, series: { id, slug, created } | null }
// Orden de las comprobaciones: token de la sesión (401/429), tamaño (413), cuerpo y versión (400/426), organizador activo (403).
// El evento nace SIEMPRE como borrador. Reenviar el mismo `event.app_id` no duplica ni cambia nada.
export async function POST(request: Request) {
  const auth = await organizerFromRequest(request);
  if (auth instanceof Response) return auth;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return json({ code: "payload_too_large", error: "El cuerpo es demasiado grande." }, 413);
  const parsed = parseUploadEventBody(await request.text());
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return unavailable();

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) {
      return json({ code: organizer.status === 403 ? "organizer_not_active" : "service_unavailable", error: organizer.error }, organizer.status);
    }
    const { data, error } = await db.rpc("app_upload_event", { p_organizer: auth.organizer, p_series: parsed.series, p_event: parsed.event });
    if (error) {
      const known = dbFailure(error.message ?? "");
      return known ? json({ code: known.code, error: known.error }, known.status) : unavailable();
    }
    const row = (Array.isArray(data) ? data[0] : data) as UploadEventRow | undefined;
    if (!row) return unavailable();
    return json(buildUploadEventResponse(row), row.r_event_created ? 201 : 200);
  } catch {
    return unavailable();
  }
}
