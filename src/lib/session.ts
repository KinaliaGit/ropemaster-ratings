import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type Role = "participante" | "organizador";
export type Session = { role: Role; id: string; name: string; verified: boolean; demo: boolean; isAdmin: boolean; avatarPath?: string | null };

// Cookie SOLO para el participante de demostración (los participantes reales entrarán por celular).
export const SESSION_COOKIE = "rm_session";
const DEMO_PARTICIPANT: Session = { role: "participante", id: "r1", name: "Ana Estrada", verified: false, demo: true, isAdmin: false };
export const demoSession = (): Session => DEMO_PARTICIPANT;

// Quién es la persona que visita. Real: la sesión de Supabase + su perfil. Demo: solo el participante de ejemplo.
// El rol de organizador NUNCA viene de una cookie editable: sale de la base de datos.
export const getSession = cache(async (): Promise<Session | null> => {
  // Verificar el token usa la hora actual: esto debe ocurrir al atender la petición, nunca al prerenderizar.
  await connection();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId) {
    const [{ data: profile }, { data: adminRow }] = await Promise.all([
      supabase.from("profiles").select("role, display_name, organizer_verified").eq("user_id", userId).maybeSingle(),
      // La tabla admins solo deja ver la propia fila: si aparece, esta persona es administradora.
      supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (profile) {
      const session: Session = { role: profile.role as Role, id: userId, name: profile.display_name, verified: profile.organizer_verified, demo: false, isAdmin: !!adminRow };
      if (session.role === "participante") {
        // Su perfil de participante (my_roper_id evita leer ropers.user_id, que está oculto) y su foto.
        const { data: roperId } = await supabase.rpc("my_roper_id");
        if (roperId) session.avatarPath = (await supabase.from("ropers").select("avatar_path").eq("id", roperId).maybeSingle()).data?.avatar_path ?? null;
      }
      return session;
    }
  }
  if ((await cookies()).get(SESSION_COOKIE)?.value === "participante") return DEMO_PARTICIPANT;
  return null;
});
