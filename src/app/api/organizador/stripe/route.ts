import { stripe, siteUrl } from "@/lib/stripe";

// Alta del organizador en Stripe Connect (Express): crea su cuenta y devuelve el enlace de onboarding.
export async function POST() {
  // TODO: exigir sesión de organizador; reutilizar su stripe_account_id guardado si ya existe.
  const account = await stripe().accounts.create({
    type: "express",
    country: "MX",
    capabilities: { transfers: { requested: true } },
  });
  // TODO: guardar account.id en el perfil del organizador.
  const link = await stripe().accountLinks.create({
    account: account.id,
    type: "account_onboarding",
    refresh_url: `${siteUrl}/organizador`,
    return_url: `${siteUrl}/organizador?stripe=listo`,
  });
  return Response.json({ url: link.url });
}
