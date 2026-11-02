import { stripe } from "@/lib/stripe";

// Stripe avisa aquí cuando un pago se completa. Es la ÚNICA fuente de verdad para marcar "pagado".
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Falta configuración", { status: 400 });

  let event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Firma inválida", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    if (s.payment_status === "paid") {
      // TODO: con Supabase (service role), upsert en registrations usando s.id como
      // provider_payment_id para que reintentos del webhook no dupliquen:
      // { event_id, roper_id, category, payment_status: 'pagado', amount_cents: s.amount_total }
      console.log("pago confirmado", s.id, s.metadata);
    }
  }
  return new Response(null, { status: 200 });
}
