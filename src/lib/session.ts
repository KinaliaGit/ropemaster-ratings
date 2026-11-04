import { cache } from "react";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";

export type Role = "participante" | "organizador";
export type Session = { role: Role; id: string; name: string; verified: boolean; demo: boolean };

// Cookie SOLO para el participante de demostración (los participantes reales entrarán por celular).
export const SESSION_COOKIE = "rm_session";
const DEMO_PARTICIPANT: Session = { role: "participante", id: "r1", name: "Ana Estrada", verified: false, demo: true };
export const demoSession = (): Session => DEMO_PARTICIPANT;

// Quién es la persona que visita. Real: la sesión de Supabase + su perfil. Demo: solo el participante de ejemplo.
// El rol de organizador NUNCA viene de una cookie editable: sale de la base de datos.
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId) {
    const { data: profile } = await supabase.from("profiles").select("role, display_name, organizer_verified").eq("user_id", userId).maybeSingle();
    if (profile) return { role: profile.role as Role, id: userId, name: profile.display_name, verified: profile.organizer_verified, demo: false };
  }
  if ((await cookies()).get(SESSION_COOKIE)?.value === "participante") return DEMO_PARTICIPANT;
  return null;
});
