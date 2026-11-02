import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Falta STRIPE_SECRET_KEY");
  return (client ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

// Comisión de la plataforma en puntos base (250 = 2.5%). Se suma a lo que cobra Stripe.
export const platformFeeBps = Number(process.env.PLATFORM_FEE_BPS ?? 0);
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
