"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, demoSession, type Role } from "@/lib/session";
import { recordConsent } from "@/lib/consent";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");

// Solo rutas internas: evita redirecciones abiertas (//otro-sitio.com o https://...).
function safeNext(next: FormDataEntryValue | null, fallback: string) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function login(formData: FormData) {
  const role = formData.get("role") as Role;
  if (role !== "participante" && role !== "organizador") return;
  const l = lang(formData.get("lang"));
  // TODO: reemplazar por supabase.auth.signInWithOtp / signInWithPassword.
  (await cookies()).set(SESSION_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(safeNext(formData.get("next"), `/${l}/${role === "organizador" ? "organizador" : "mi-cuenta"}`));
}

// Crear cuenta: exige aceptar términos y aviso de privacidad (se valida aquí, no solo en el formulario).
export async function register(formData: FormData) {
  const role = formData.get("role") as Role;
  if (role !== "participante" && role !== "organizador") return;
  const l = lang(formData.get("lang"));
  if (formData.get("accept") !== "on") redirect(`/${l}/registro?error=terms`);
  // TODO: crear el usuario en Supabase Auth y guardar la constancia en la tabla consents.
  recordConsent(role, demoSession(role).id);
  (await cookies()).set(SESSION_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(`/${l}/${role === "organizador" ? "organizador" : "mi-cuenta"}`);
}

export async function logout(formData: FormData) {
  (await cookies()).delete(SESSION_COOKIE);
  redirect(`/${lang(formData.get("lang"))}`);
}
