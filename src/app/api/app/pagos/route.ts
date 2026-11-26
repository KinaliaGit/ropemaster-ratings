import { organizerFromRequest } from "@/lib/app-auth";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";

import { MAX_BYTES, buildPaymentsResponse, parsePaymentsBody, type PaymentRow } from "@/lib/app-results";

// La app sube el estado de pago de los inscritos de un evento (KIN-706). Contrato en docs/SYNC_API.md.
//   POST /api/app/pagos  { contract_version, client_batch_id?, payments: [...] }
//   -> 200 { contract_version, client_batch_id, payments: [{ id, status, ... }] }  (una entrada por pago, en el mismo orden)
// Orden de las comprobaciones: token de la sesión (401/429), tamaño (413), cuerpo y versión (400/426), organizador activo (403).
// Cada pago se juzga solo (aceptado, sin cambios, corregido o rechazado con su motivo), así que la app reintenta solo lo que falló.
// Reenviar el mismo lote no duplica nada. Un pago en línea (Stripe) manda sobre lo que diga la app.
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function POST(request: Request) {
  const auth = await organizerFromRequest(request);
  if (auth instanceof Response) return auth;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return json({ code: "payload_too_large", error: "El cuerpo es demasiado grande: parte el lote en mitades." }, 413);
  const parsed = parsePaymentsBody(await request.text());
  if (!parsed.ok) return json({ code: parsed.code, error: parsed.error }, parsed.status);

  const db = adminClient();
  if (!db) return json({ error: "Servicio no disponible" }, 503);

  try {
    const organizer = await checkActiveOrganizer(db, auth.organizer);
    if (!organizer.ok) return json({ error: organizer.error }, organizer.status);

    const { data, error } = await db.rpc("app_upload_payments", {
      p_organizer: auth.organizer,
      p_payments: parsed.payments,
      p_client_batch: parsed.clientBatchId,
    });
    if (error) return json({ error: "Servicio no disponible" }, 503);
    return json(buildPaymentsResponse((data ?? []) as PaymentRow[], parsed.clientBatchId));
  } catch {
    return json({ error: "Servicio no disponible" }, 503);
  }
}
