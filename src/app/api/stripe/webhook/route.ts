import { stripe } from "@/lib/stripe";
import { createServiceSupabase } from "@/lib/supabase/service";

// Stripe avisa aquí cuando un pago se completa. Es la ÚNICA fuente de verdad para marcar "pagado" un pago EN LÍNEA
// (efectivo y transferencia los marca el organizador). La firma del aviso se verifica con STRIPE_WEBHOOK_SECRET.
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
    const registrationId = s.metadata?.registration_id;
    if (s.payment_status === "paid" && registrationId) {
      const supabase = createServiceSupabase();
      if (!supabase) return new Response("Falta SUPABASE_SERVICE_ROLE_KEY", { status: 500 }); // Stripe reintenta el aviso
      // Idempotente: el id del cobro (s.id) solo se registra una vez, así que un reintento del aviso no duplica ni cambia nada.
      const { error } = await supabase.rpc("confirm_stripe_payment", { p_registration: registrationId, p_payment_id: s.id, p_amount_cents: s.amount_total });
      if (error) return new Response("No se pudo registrar el pago", { status: 500 });
    }
  }
  return new Response(null, { status: 200 });
}
