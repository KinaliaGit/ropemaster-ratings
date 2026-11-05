import { cache } from "react";
import { connection } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export type Role = "participante" | "organizador";
// `verified` = organizador ACTIVO: licencia vigente o aprobado a mano por un admin. Solo así puede operar (la base lo impone igual).
// `license`: "valid" (licencia vigente), "expired" (tuvo licencia y venció), "none" (nunca la vinculó). `licenseUntil`: vencimiento (null = sin vencimiento / sin licencia).
export type LicenseState = "valid" | "expired" | "none";
export type Session = { role: Role; id: string; name: string; verified: boolean; manual: boolean; license: LicenseState; hasRoper: boolean; licenseUntil: string | null; isAdmin: boolean; avatarPath?: string | null };

// Quién es la persona que visita. La sesión de Supabase + su perfil.
// El rol de organizador NUNCA viene de una cookie editable: sale de la base de datos.
export const getSession = cache(async (): Promise<Session | null> => {
  // Verificar el token usa la hora actual: esto debe ocurrir al atender la petición, nunca al prerenderizar.
  await connection();
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId) {
    const [{ data: profile }, { data: adminRow }] = await Promise.all([
      supabase.from("profiles").select("role, display_name, organizer_verified, license_valid_until").eq("user_id", userId).maybeSingle(),
      // La tabla admins solo deja ver la propia fila: si aparece, esta persona es administradora.
      supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (profile) {
      const until = profile.license_valid_until as string | null; // 'infinity' = sin vencimiento
      const license: LicenseState = !until ? "none" : until === "infinity" || new Date(until).getTime() > Date.now() ? "valid" : "expired";
      const manual = profile.organizer_verified === true;
      const session: Session = {
        role: profile.role as Role, id: userId, name: profile.display_name, verified: manual || license === "valid", manual, license,
        licenseUntil: until && until !== "infinity" ? until : null, isAdmin: !!adminRow, hasRoper: false,
      };
      // Su perfil de lazador, si lo tiene (cualquier cuenta puede: un organizador también puede competir). my_roper_id evita leer ropers.user_id, que está oculto.
      const { data: roperId } = await supabase.rpc("my_roper_id");
      if (roperId) {
        session.hasRoper = true;
        session.avatarPath = (await supabase.from("ropers").select("avatar_path").eq("id", roperId).maybeSingle()).data?.avatar_path ?? null;
      }
      return session;
    }
  }
  return null;
});
