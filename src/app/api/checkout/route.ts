import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { stripe, platformFeeBps, siteUrl } from "@/lib/stripe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pago en línea de una inscripción PROPIA y pendiente (Stripe Checkout).
// El monto sale SIEMPRE de la inscripción en la base (el precio con el que apartó su lugar), nunca de lo que mande el navegador.
// Quien confirma el pago es el webhook (ver /api/stripe/webhook), no esta ruta.
export async function POST(request: Request) {
  const { registrationId, lang: rawLang } = (await request.json()) as { registrationId?: string; lang?: string };
  const lang = rawLang === "en" ? "en" : "es";
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (!session.hasRoper) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!registrationId || !UUID.test(registrationId)) return Response.json({ error: "invalid" }, { status: 400 });

  // Las reglas de la base solo devuelven inscripciones propias.
  const { data: reg } = await (await createServerSupabase()).from("registrations")
    .select("id, payment_status, amount_cents, event_categories(name), events(name)").eq("id", registrationId).maybeSingle();
  if (!reg) return Response.json({ error: "invalid" }, { status: 404 });
  if (reg.payment_status !== "pendiente") return Response.json({ error: "already" }, { status: 409 });

  // TODO: leer de la base la cuenta conectada de Stripe del organizador del evento (por ahora, la de prueba).
  const organizerAccount = process.env.STRIPE_TEST_CONNECTED_ACCOUNT;
  if (!process.env.STRIPE_SECRET_KEY || !organizerAccount) return Response.json({ error: "noPayouts" }, { status: 409 });

  const evName = (reg.events as unknown as { name: string } | null)?.name ?? "Evento";
  const catName = (reg.event_categories as unknown as { name: string } | null)?.name ?? "";
  const amount = reg.amount_cents;
  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "mxn", unit_amount: amount, product_data: { name: `${evName} · ${catName}` } } }],
    payment_intent_data: { application_fee_amount: Math.round((amount * platformFeeBps) / 10000), transfer_data: { destination: organizerAccount } },
    metadata: { registration_id: reg.id },
    locale: lang,
    success_url: `${siteUrl}/${lang}/mi-cuenta?pago=ok`,
    cancel_url: `${siteUrl}/${lang}/mi-cuenta`,
  });
  return Response.json({ url: checkout.url });
}
