import { events } from "@/lib/mock";
import { stripe, platformFeeBps, siteUrl } from "@/lib/stripe";

// Crea una sesión de Stripe Checkout para inscribirse a un evento.
// El precio SIEMPRE se calcula aquí con los datos del servidor, nunca con lo que mande el navegador.
export async function POST(request: Request) {
  const { eventId, category } = (await request.json()) as { eventId?: string; category?: string };
  // TODO: exigir sesión de participante y tomar roper_id del usuario autenticado.
  const roperId = "r1";

  const event = events.find((e) => e.id === eventId);
  const cat = event?.categories.find((c) => c.name === category);
  if (!event || !cat) return Response.json({ error: "Evento o categoría inválidos" }, { status: 400 });
  if (event.status !== "publicado" || event.registered.length >= event.capacity)
    return Response.json({ error: "Inscripciones cerradas" }, { status: 409 });

  // TODO: leer de la base de datos la cuenta conectada del organizador del evento.
  const organizerAccount = process.env.STRIPE_TEST_CONNECTED_ACCOUNT;
  if (!organizerAccount) return Response.json({ error: "El organizador aún no activa sus cobros" }, { status: 409 });

  const amount = cat.fee * 100;
  const session = await stripe().checkout.sessions.create({
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
    success_url: `${siteUrl}/mi-cuenta?pago=ok`,
    cancel_url: `${siteUrl}/eventos/${event.id}/inscribirse`,
  });
  return Response.json({ url: session.url });
}
