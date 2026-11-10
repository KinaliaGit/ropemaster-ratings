"use server";
import { redirect } from "next/navigation";
import { refreshOrganizerLicense } from "@/lib/license-link";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

// «Ya compré mi licencia»: vuelve a comprobarla con el correo de la cuenta y actualiza el estado al momento.
export async function recheckLicense(formData: FormData) {
  const l = formData.get("lang") === "en" ? "en" : "es";
  const s = await getSession();
  if (s?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  const { data } = await (await createServerSupabase()).auth.getUser();
  const result = data.user ? await refreshOrganizerLicense(data.user) : "unavailable";
  redirect(`/${l}/organizador?licencia=${result}`);
}
