import { stripe, siteUrl } from "@/lib/stripe";
import { getSession } from "@/lib/session";

// Alta del organizador en Stripe Connect (Express): crea su cuenta y devuelve el enlace de onboarding.
export async function POST() {
  const session = await getSession();
  if (session?.role !== "organizador") return Response.json({ error: "No autorizado" }, { status: 401 });
  // TODO: reutilizar su stripe_account_id guardado si ya existe.
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
