import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { ensureProfile } from "@/lib/account";
import { createServerSupabase } from "@/lib/supabase/server";
import { isRecoveryType, recoveryDestination } from "@/lib/password-reset";

// Enlace del correo de confirmación (y el de recuperar la contraseña, `type=recovery`). Acepta el formato con `token_hash` (plantilla de correo propia) y el de `code` (PKCE).
// Confirma, deja la sesión iniciada, crea el perfil si hace falta y lleva a su espacio.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "en" ? "en" : "es";
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  const supabase = await createServerSupabase();
  // KIN-601: el enlace de «olvidé mi contraseña» deja la sesión y lleva a elegir la nueva; nunca a «bienvenido» ni al panel.
  if (isRecoveryType(type)) {
    let verified = false;
    if (tokenHash) verified = !(await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error;
    else if (code) verified = !(await supabase.auth.exchangeCodeForSession(code)).error;
    redirect(recoveryDestination(lang, verified));
  }
  let ok = false;
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  // KIN-624: un enlace ya usado (o recargar esta página) no debe dejar a nadie en una pantalla de error si su sesión sigue activa:
  // la cuenta ya está verificada y se le lleva a su espacio con ese mensaje. Sin sesión, a Entrar con el aviso de enlace vencido.
  if (!ok) {
    const { data: current } = await supabase.auth.getUser();
    const existing = current.user ? await ensureProfile(supabase, current.user) : null;
    if (existing) redirect(`/${lang}/${existing.role === "organizador" ? "organizador" : "mi-cuenta"}?yaVerificada=1`);
    redirect(`/${lang}/entrar?error=confirm`);
  }

  const { data } = await supabase.auth.getUser();
  const profile = data.user ? await ensureProfile(supabase, data.user) : null;
  if (!profile) redirect(`/${lang}/entrar?error=invalid`);
  redirect(`/${lang}/${profile.role === "organizador" ? "organizador" : "mi-cuenta"}?bienvenido=1`);
}
