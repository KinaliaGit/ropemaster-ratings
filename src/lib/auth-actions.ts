"use server";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";

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

// Entrar: el rol elegido debe coincidir con el de la cuenta (no se entra como organizador con una cuenta de participante).
// Un participante enlaza aquí su perfil con el que un organizador pudo crear con su correo (idempotente).
export async function signIn(formData: FormData) {
  const l = lang(formData.get("lang"));
  const role = roleOf(formData.get("role"));
  const next = str(formData.get("next"), 300);
  const back = (error: string) => redirect(`/${l}/entrar?role=${role}&error=${error}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email: str(formData.get("email"), 200), password: str(formData.get("password"), 100) });
  if (error || !data.user) return back("invalid");
  const { data: profile } = await supabase.from("profiles").select("role, display_name").eq("user_id", data.user.id).maybeSingle();
  if (!profile || profile.role !== role) { await supabase.auth.signOut(); return back(profile ? "role" : "invalid"); }
  if (role === "participante") await supabase.rpc("claim_my_roper", { p_name: profile.display_name });
  redirect(safeNext(next, home(l, role)));
}

// Crea la cuenta y su perfil, y deja constancia de la aceptación de términos y privacidad.
// Un participante además reclama el perfil que un organizador haya creado con su correo (o se crea uno nuevo).
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
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
  if (error) return fail(/registered|exists/i.test(error.message) ? "exists" : /password/i.test(error.message) ? "password" : "generic");
  // Si el proyecto exige confirmar el correo, aún no hay sesión: se pide revisar el correo (el perfil se crea al primer inicio de sesión).
  if (!data.session || !data.user) redirect(`/${l}/registro?role=${role}&check=email`);

  const userId = data.user.id;
  const { error: profileError } = await supabase.from("profiles").insert({ user_id: userId, role, display_name: name, email });
  const { error: consentError } = await supabase.from("consents").insert([
    { user_id: userId, document: "terms", version: LEGAL.version },
    { user_id: userId, document: "privacy", version: LEGAL.version },
  ]);
  const { error: claimError } = !profileError && role === "participante" ? await supabase.rpc("claim_my_roper", { p_name: name }) : { error: null };
  if (profileError || consentError || claimError) {
    await supabase.auth.signOut(); // no dejar una cuenta a medias (sin perfil, sin constancia o sin participante)
    return fail("generic");
  }
  redirect(`${home(l, role)}?bienvenido=1`);
}

export async function logout(formData: FormData) {
  await (await createServerSupabase()).auth.signOut();
  redirect(`/${lang(formData.get("lang"))}`);
}
