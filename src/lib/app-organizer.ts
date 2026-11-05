import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOrganizerActive, isUuid } from "@/lib/app-participants";

// Comprobación común de las rutas de la app local: el código de conexión debe ser de un organizador ACTIVO
// (licencia vigente o aprobación manual de un admin), igual que `private.organizer_active()` en la base.
export type OrganizerCheck = { ok: true } | { ok: false; status: 403 | 503; error: string };

export const NOT_ACTIVE_MESSAGE = "Tu cuenta de organizador no está activa: necesita licencia vigente o aprobación de un administrador.";

export async function checkActiveOrganizer(db: SupabaseClient, organizerId: string): Promise<OrganizerCheck> {
  // Con la base, el organizador es el id de auth.users; cualquier otra cosa (código de pruebas) no es una cuenta real.
  if (!isUuid(organizerId)) return { ok: false, status: 403, error: NOT_ACTIVE_MESSAGE };
  const profile = await db.from("profiles").select("organizer_verified, license_valid_until").eq("user_id", organizerId).eq("role", "organizador").maybeSingle();
  if (profile.error) return { ok: false, status: 503, error: "Servicio no disponible" };
  if (!isOrganizerActive(profile.data)) return { ok: false, status: 403, error: NOT_ACTIVE_MESSAGE };
  return { ok: true };
}
