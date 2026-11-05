"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El organizador del evento marca una inscripción como pagada en efectivo o transferencia, o la regresa a pendiente.
// La base valida que sea SU evento y que esté activo; un pago en línea (Stripe) no se cambia a mano.
export async function setRegistrationPayment(formData: FormData) {
  const l = formData.get("lang") === "en" ? "en" : "es";
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const method = String(formData.get("method") ?? "");
  const s = await getSession();
  if (s?.role !== "organizador" || !s.verified || !UUID.test(id)) redirect(`/${l}/organizador`);
  const { error } = await (await createServerSupabase()).rpc("set_registration_payment", { p_registration: id, p_method: method === "pendiente" ? null : method });
  if (!error) updateTag("registrations");
  redirect(`/${l}/organizador/eventos/${encodeURIComponent(slug)}${error ? "?pagoError=1" : ""}`);
}
