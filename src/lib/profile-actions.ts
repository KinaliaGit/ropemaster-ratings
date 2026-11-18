"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { parseRoleChoice } from "@/lib/roles";

// Crea el perfil de lazador de quien ya tiene cuenta (por ejemplo, un organizador que también compite).
// Si un organizador ya lo había registrado con el mismo correo, lo reclama en lugar de crear un duplicado.
export async function createMyRoperProfile(formData: FormData) {
  const l = formData.get("lang") === "en" ? "en" : "es";
  const s = await getSession();
  if (!s) redirect(`/${l}/entrar`);
  if (!s.hasRoper) {
    const choice = parseRoleChoice(formData.get("roperRole"), formData.get("roperFavorite"));
    if (!choice) redirect(`/${l}/mi-cuenta?error=role`);
    const { error } = await (await createServerSupabase()).rpc("claim_my_roper", { p_name: s.name, p_role: choice.role, p_favorite: choice.favorite });
    if (error) redirect(`/${l}/mi-cuenta?error=failed`);
    updateTag("ropers");
  }
  redirect(`/${l}/mi-cuenta?perfil=ok`);
}

// Elegir o cambiar con qué rol compite (cabecero, pialador o ambos y su favorito). Va directo a su perfil: la base solo deja cambiar el propio
// y comprueba que "ambos" traiga favorito.
export async function setMyRole(formData: FormData) {
  const l = formData.get("lang") === "en" ? "en" : "es";
  const s = await getSession();
  if (!s) redirect(`/${l}/entrar`);
  const choice = parseRoleChoice(formData.get("roperRole"), formData.get("roperFavorite"));
  if (!choice) redirect(`/${l}/mi-cuenta?error=role`);
  const supabase = await createServerSupabase();
  const { data: roperId } = await supabase.rpc("my_roper_id");
  if (!roperId) redirect(`/${l}/mi-cuenta`);
  const { error } = await supabase.from("ropers").update({ primary_role: choice.role, favorite_role: choice.favorite }).eq("id", roperId);
  if (error) redirect(`/${l}/mi-cuenta?error=failed`);
  updateTag("ropers");
  redirect(`/${l}/mi-cuenta?rol=ok`);
}
