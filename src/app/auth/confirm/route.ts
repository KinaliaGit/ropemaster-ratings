import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ensureProfile } from "@/lib/account";
import { createServerSupabase } from "@/lib/supabase/server";

// Enlace del correo de confirmación. Acepta el formato con `token_hash` (plantilla de correo propia) y el de `code` (PKCE).
// Confirma, deja la sesión iniciada, crea el perfil si hace falta y lleva a su espacio.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "es";
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  const supabase = await createServerSupabase();
  let ok = false;
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  if (!ok) redirect(`/${lang}/entrar?error=confirm`);

  const { data } = await supabase.auth.getUser();
  const profile = data.user ? await ensureProfile(supabase, data.user) : null;
  if (!profile) redirect(`/${lang}/entrar?error=invalid`);
  redirect(`/${lang}/${profile.role === "organizador" ? "organizador" : "mi-cuenta"}?bienvenido=1`);
}
