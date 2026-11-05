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

// ---- Organizadores (cuentas reales con Supabase Auth) ----

export async function signInOrganizer(formData: FormData) {
  const l = lang(formData.get("lang"));
  const next = str(formData.get("next"), 300);
  const { error } = await (await createServerSupabase()).auth.signInWithPassword({ email: str(formData.get("email"), 200), password: str(formData.get("password"), 100) });
  if (error) redirect(`/${l}/entrar?error=invalid${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  redirect(safeNext(next, `/${l}/organizador`));
}

// Crea la cuenta, el perfil de organizador y deja constancia de la aceptación de términos y privacidad.
export async function registerOrganizer(formData: FormData) {
  const l = lang(formData.get("lang"));
  if (formData.get("accept") !== "on") redirect(`/${l}/registro?error=terms`);

  const name = str(formData.get("name"), 80);
  const email = str(formData.get("email"), 200).toLowerCase();
  const password = str(formData.get("password"), 100);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`/${l}/registro?error=generic`);
  if (password.length < 8) redirect(`/${l}/registro?error=password`);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
  if (error) redirect(`/${l}/registro?error=${/registered|exists/i.test(error.message) ? "exists" : /password/i.test(error.message) ? "password" : "generic"}`);
  // Si el proyecto exige confirmar el correo, aún no hay sesión: se pide revisar el correo.
  if (!data.session || !data.user) redirect(`/${l}/registro?check=email`);

  const userId = data.user.id;
  const { error: profileError } = await supabase.from("profiles").insert({ user_id: userId, role: "organizador", display_name: name, email });
  const { error: consentError } = await supabase.from("consents").insert([
    { user_id: userId, document: "terms", version: LEGAL.version },
    { user_id: userId, document: "privacy", version: LEGAL.version },
  ]);
  if (profileError || consentError) {
    await supabase.auth.signOut(); // no dejar una cuenta a medias (sin perfil o sin constancia de aceptación)
    redirect(`/${l}/registro?error=generic`);
  }
  redirect(`/${l}/organizador?bienvenido=1`);
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
