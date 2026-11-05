"use server";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verificar o revocar a un organizador. Solo administradores: la verificación real la hace la función de la base
// (admin_set_organizer_verified), que vuelve a comprobar que quien llama es admin y deja el registro de auditoría.
export async function setOrganizerVerified(formData: FormData) {
  const lang = formData.get("lang") === "en" ? "en" : "es";
  const s = await getSession();
  const target = formData.get("target");
  if (!s?.isAdmin || typeof target !== "string" || !UUID.test(target)) redirect(`/${lang}/organizador`);
  const value = formData.get("value") === "true";
  const { error } = await (await createServerSupabase()).rpc("admin_set_organizer_verified", { target, value });
  redirect(`/${lang}/organizador/admin${error ? "?error=1" : ""}`);
}
