import { getPublicEvent } from "@/lib/data/events";
import { getSession } from "@/lib/session";
import { stripe, platformFeeBps, siteUrl } from "@/lib/stripe";

// Crea una sesión de Stripe Checkout para inscribirse a un evento.
// El precio SIEMPRE se calcula aquí con los datos del servidor, nunca con lo que mande el navegador.
export async function POST(request: Request) {
  const { eventId, category, lang: rawLang } = (await request.json()) as { eventId?: string; category?: string; lang?: string };
  const lang = rawLang === "en" ? "en" : "es";
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthenticated" }, { status: 401 });
  if (session.role !== "participante") return Response.json({ error: "forbidden" }, { status: 403 });
  const roperId = session.id;

  const event = eventId ? await getPublicEvent(eventId) : null;
  const cat = event?.categories.find((c) => c.name === category);
  if (!event || !cat) return Response.json({ error: "invalid" }, { status: 400 });
  if (event.registered.includes(roperId)) return Response.json({ error: "already" }, { status: 409 });
  if (event.status !== "publicado" || event.registered.length >= event.capacity)
    return Response.json({ error: "closed" }, { status: 409 });

  // TODO: leer de la base de datos la cuenta conectada del organizador del evento.
  const organizerAccount = process.env.STRIPE_TEST_CONNECTED_ACCOUNT;
  if (!organizerAccount) return Response.json({ error: "noPayouts" }, { status: 409 });

  const amount = cat.fee * 100;
  const checkout = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: { currency: "mxn", unit_amount: amount, product_data: { name: `${event.name} · ${cat.name}` } },
    }],
    payment_intent_data: {
      application_fee_amount: Math.round((amount * platformFeeBps) / 10000),
      transfer_data: { destination: organizerAccount },
    },
    metadata: { event_id: event.id, category: cat.name, roper_id: roperId },
    locale: lang,
    success_url: `${siteUrl}/${lang}/mi-cuenta?pago=ok`,
    cancel_url: `${siteUrl}/${lang}/eventos/${event.id}/inscribirse`,
  });
  return Response.json({ url: checkout.url });
}
