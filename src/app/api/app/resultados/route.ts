import { organizerFromRequest } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { MAX_BYTES, buildUploadResponse, parseUploadBody, type UploadRow } from "@/lib/app-results";

// La app sube los resultados de un evento (KIN-587). Contrato en docs/SYNC_API.md.
//   POST /api/app/resultados  { contract_version, client_batch_id?, results: [...] }
//   -> 200 { contract_version, client_batch_id, results: [{ id, status, ... }] }  (una entrada por resultado, en el mismo orden)
// Orden de las comprobaciones: código de conexión (401/429), tamaño (413), cuerpo y versión (400/426), organizador activo (403).
// Cada resultado se juzga solo (aceptado, sin cambios, corregido o rechazado con su motivo), así que la app reintenta solo lo que falló.
// Reenviar el mismo lote no duplica nada. El recálculo de ratings está en pausa (KIN-571 y KIN-583): aquí solo se guarda.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  const auth = await organizerFromRequest(request);
  if (auth instanceof Response) return auth;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return json({ code: "payload_too_large", error: "El cuerpo es demasiado grande: parte el lote en mitades." }, 413);
  const parsed = parseUploadBody(await request.text());
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return json({ error: "Servicio no disponible" }, 503);

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) return json({ error: organizer.error }, organizer.status);

    const { data, error } = await db.rpc("app_upload_results", {
      p_organizer: auth.organizer,
      p_results: parsed.results,
      p_active_disciplines: ACTIVE_DISCIPLINES.map((d) => d.id),
      p_client_batch: parsed.clientBatchId,
    });
    if (error) return json({ error: "Servicio no disponible" }, 503);
    return json(buildUploadResponse((data ?? []) as UploadRow[], parsed.clientBatchId));
  } catch {
    return json({ error: "Servicio no disponible" }, 503);
  }
}
