import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { LEGAL } from "@/lib/legal";

export type AccountProfile = { role: "organizador" | "participante"; name: string };

// Garantiza que la cuenta tenga su perfil. Al registrarse, el rol, el nombre y la versión de términos aceptados viajan en los
// metadatos del usuario; si el proyecto exige confirmar el correo, aún no hay sesión al registrarse, así que el perfil
// (y la constancia de aceptación) se crean aquí, la primera vez que la persona entra o confirma su correo. Es idempotente.
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<AccountProfile | null> {
  const { data: existing } = await supabase.from("profiles").select("role, display_name").eq("user_id", user.id).maybeSingle();
  if (existing) {
    if (existing.role === "participante") await supabase.rpc("claim_my_roper", { p_name: existing.display_name });
    return { role: existing.role as AccountProfile["role"], name: existing.display_name };
  }
  const meta = user.user_metadata as { display_name?: string; role?: string; terms_version?: string };
  const name = (meta.display_name ?? "").trim().slice(0, 80);
  const role = meta.role === "participante" || meta.role === "organizador" ? meta.role : null;
  // Sin aceptación de términos registrada en el registro, no se crea el perfil.
  if (!role || name.length < 2 || !meta.terms_version) return null;

  const { error: profileError } = await supabase.from("profiles").insert({ user_id: user.id, role, display_name: name, email: (user.email ?? "").toLowerCase() });
  if (profileError) return null;
  const { error: consentError } = await supabase.from("consents").insert([
    { user_id: user.id, document: "terms", version: LEGAL.version },
    { user_id: user.id, document: "privacy", version: LEGAL.version },
  ]);
  const { error: claimError } = role === "participante" ? await supabase.rpc("claim_my_roper", { p_name: name }) : { error: null };
  if (consentError || claimError) return null;
  return { role, name };
}
