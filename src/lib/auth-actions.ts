"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";
import { ensureProfile } from "@/lib/account";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const str = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Solo rutas internas: evita redirecciones abiertas (//otro-sitio.com o https://...).
function safeNext(next: FormDataEntryValue | null, fallback: string) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

// ---- Cuentas reales (organizadores y participantes) con correo y contraseña ----

type Role = "organizador" | "participante";
const roleOf = (v: FormDataEntryValue | null): Role => (v === "participante" ? "participante" : "organizador");
const home = (l: string, role: Role) => `/${l}/${role === "organizador" ? "organizador" : "mi-cuenta"}`;

// Entrar: el rol elegido es el espacio al que se llega. Una cuenta de organizador también puede entrar a su perfil de lazador;
// una cuenta de participante no tiene espacio de organizador (eso pasa por licencia o aprobación).
// Si es la primera vez tras confirmar el correo, aquí se crea su perfil (ensureProfile); un participante enlaza su perfil con el
// que un organizador pudo crear con su correo.
export async function signIn(formData: FormData) {
  const l = lang(formData.get("lang"));
  const role = roleOf(formData.get("role"));
  const next = str(formData.get("next"), 300);
  const back = (error: string) => redirect(`/${l}/entrar?role=${role}&error=${error}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: str(formData.get("email"), 200), password: str(formData.get("password"), 100) });
  if (error || !data.user) return back(/confirm/i.test(error?.message ?? "") ? "unconfirmed" : "invalid");
  const profile = await ensureProfile(supabase, data.user);
  if (!profile || (role === "organizador" && profile.role !== "organizador")) { await supabase.auth.signOut(); return back(profile ? "role" : "invalid"); }
  redirect(safeNext(next, home(l, role)));
}

const siteOrigin = async () => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
};

// Crea la cuenta y deja en sus metadatos el rol, el nombre y la versión de términos aceptados. Con sesión inmediata crea el perfil
// y la constancia al instante; si el proyecto exige confirmar el correo, se crean al confirmar o al entrar por primera vez (ensureProfile).
export async function registerAccount(formData: FormData) {
  const l = lang(formData.get("lang"));
  const role = roleOf(formData.get("role"));
  const fail = (error: string) => redirect(`/${l}/registro?role=${role}&error=${error}`);
  if (formData.get("accept") !== "on") return fail("terms");

  const name = str(formData.get("name"), 80);
  const email = str(formData.get("email"), 200).toLowerCase();
  const password = str(formData.get("password"), 100);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("generic");
  if (password.length < 8) return fail("password");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?lang=${l}`, data: { display_name: name, role, terms_version: LEGAL.version } },
  });
  if (error) return fail(/registered|exists/i.test(error.message) ? "exists" : /password/i.test(error.message) ? "password" : "generic");
  if (!data.session || !data.user) redirect(`/${l}/registro?role=${role}&check=email&email=${encodeURIComponent(email)}`);

  const profile = await ensureProfile(supabase, data.user);
  if (!profile) {
    await supabase.auth.signOut(); // no dejar una cuenta a medias (sin perfil, sin constancia o sin participante)
    return fail("generic");
  }
  redirect(`${home(l, role)}?bienvenido=1`);
}

// Reenvía el correo de confirmación.
export async function resendConfirmation(formData: FormData) {
  const l = lang(formData.get("lang"));
  const role = roleOf(formData.get("role"));
  const email = str(formData.get("email"), 200).toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await (await createServerSupabase()).auth.resend({ type: "signup", email, options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?lang=${l}` } });
  }
  redirect(`/${l}/registro?role=${role}&check=email&resent=1&email=${encodeURIComponent(email)}`);
}

export async function logout(formData: FormData) {
  await (await createServerSupabase()).auth.signOut();
  redirect(`/${lang(formData.get("lang"))}`);
}
