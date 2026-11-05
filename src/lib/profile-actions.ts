"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

// Crea el perfil de lazador de quien ya tiene cuenta (por ejemplo, un organizador que también compite).
// Si un organizador ya lo había registrado con el mismo correo, lo reclama en lugar de crear un duplicado.
export async function createMyRoperProfile(formData: FormData) {
  const l = formData.get("lang") === "en" ? "en" : "es";
  const s = await getSession();
  if (!s) redirect(`/${l}/entrar`);
  if (!s.hasRoper) {
    const { error } = await (await createServerSupabase()).rpc("claim_my_roper", { p_name: s.name });
    if (error) redirect(`/${l}/mi-cuenta?error=failed`);
    updateTag("ropers");
  }
  redirect(`/${l}/mi-cuenta?perfil=ok`);
}
