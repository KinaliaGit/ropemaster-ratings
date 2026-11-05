"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { recordConsent } from "@/lib/consent";
import { LEGAL } from "@/lib/legal";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const str = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Solo rutas internas: evita redirecciones abiertas (//otro-sitio.com o https://...).
function safeNext(next: FormDataEntryValue | null, fallback: string) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

// ---- Organizadores (cuentas reales con Supabase Auth, solo con el correo) ----
// No hay contraseña: se envía un código de 6 dígitos al correo y se teclea en la web.
// Crear cuenta y entrar usan el mismo flujo; al crear, el nombre y la versión de los términos aceptados viajan en los metadatos
// del usuario y, al verificar el código, se crean el perfil y la constancia de aceptación.

export type OtpError = "terms" | "name" | "email" | "wait" | "failed" | "code" | "noaccount";
export type OtpState = null | { step: "email"; error?: OtpError } | { step: "code"; email: string; name: string; error?: OtpError };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function organizerOtp(_prev: OtpState, formData: FormData): Promise<OtpState> {
  const intent = formData.get("intent");
  const mode = formData.get("mode") === "register" ? "register" : "login";
  const email = str(formData.get("email"), 200).toLowerCase();
  const name = str(formData.get("name"), 80);
  const supabase = await createServerSupabase();

  if (intent === "reset") return { step: "email" };

  if (intent === "send") {
    if (mode === "register") {
      if (formData.get("accept") !== "on") return { step: "email", error: "terms" };
      if (name.length < 2) return { step: "email", error: "name" };
    }
    if (!EMAIL.test(email)) return { step: "email", error: "email" };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: mode === "register"
        ? { shouldCreateUser: true, data: { display_name: name, terms_version: LEGAL.version } }
        : { shouldCreateUser: false },
    });
    // Al entrar no se revela si el correo existe: si no hay cuenta, el código simplemente no llega.
    if (error && (error.status === 429 || /rate|seconds|too many/i.test(error.message))) return { step: "email", error: "wait" };
    if (error && mode === "register") return { step: "email", error: "failed" };
    return { step: "code", email, name };
  }

  // intent === "verify"
  const l = lang(formData.get("lang"));
  const token = str(formData.get("token"), 12).replace(/\s/g, "");
  if (!/^\d{6,8}$/.test(token)) return { step: "code", email, name, error: "code" };
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) return { step: "code", email, name, error: "code" };

  const user = data.user;
  const { data: profile } = await supabase.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!profile) {
    // Cuenta nueva: solo se crea el perfil si en el registro se aceptaron términos y privacidad.
    const meta = user.user_metadata as { display_name?: string; terms_version?: string };
    const displayName = (meta.display_name ?? "").trim().slice(0, 80);
    if (!meta.terms_version || displayName.length < 2) {
      await supabase.auth.signOut();
      return { step: "email", error: "noaccount" };
    }
    const { error: profileError } = await supabase.from("profiles").insert({ user_id: user.id, role: "organizador", display_name: displayName, email });
    const { error: consentError } = await supabase.from("consents").insert([
      { user_id: user.id, document: "terms", version: LEGAL.version },
      { user_id: user.id, document: "privacy", version: LEGAL.version },
    ]);
    if (profileError || consentError) {
      await supabase.auth.signOut(); // no dejar una cuenta a medias (sin perfil o sin constancia de aceptación)
      return { step: "email", error: "failed" };
    }
    redirect(`/${l}/organizador?bienvenido=1`);
  }
  redirect(safeNext(formData.get("next"), `/${l}/organizador`));
}

// ---- Participante de DEMOSTRACIÓN (los participantes reales entrarán por celular) ----

export async function login(formData: FormData) {
  if (formData.get("role") !== "participante") return;
  const l = lang(formData.get("lang"));
  (await cookies()).set(SESSION_COOKIE, "participante", { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(safeNext(formData.get("next"), `/${l}/mi-cuenta`));
}

export async function register(formData: FormData) {
  if (formData.get("role") !== "participante") return;
  const l = lang(formData.get("lang"));
  if (formData.get("accept") !== "on") redirect(`/${l}/registro?error=terms`);
  recordConsent("participante", "r1"); // TODO: constancia real cuando existan los participantes en la base
  (await cookies()).set(SESSION_COOKIE, "participante", { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(`/${l}/mi-cuenta`);
}

export async function logout(formData: FormData) {
  await (await createServerSupabase()).auth.signOut();
  (await cookies()).delete(SESSION_COOKIE);
  redirect(`/${lang(formData.get("lang"))}`);
}
