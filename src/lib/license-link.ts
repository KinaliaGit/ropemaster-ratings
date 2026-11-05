import "server-only";
import type { User } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { checkLicenseByEmail } from "@/lib/licencias";

export type LinkResult = "valid" | "none" | "conflict" | "unavailable";

// Vincula (o desvincula) la licencia de un organizador con la base de licencias. REGLAS:
//  - Solo con el correo CONFIRMADO de la cuenta: el correo de la licencia debe ser ese mismo (se busca por él).
//  - Un folio (compra) solo se vincula a una cuenta (índice único): si ya está en otra, queda en revisión manual ("conflict").
//  - "unavailable" (no se pudo comprobar) NO cambia nada; "none" (confirmado que no hay licencia vigente) limpia la licencia.
// La aprobación manual de un admin (organizer_verified) es independiente y nunca se toca aquí.
export async function refreshOrganizerLicense(user: User): Promise<LinkResult> {
  if (!user.email || !user.email_confirmed_at) return "unavailable";
  const admin = adminClient();
  if (!admin) return "unavailable"; // sin la llave de servicio no se puede guardar el resultado
  const check = await checkLicenseByEmail(user.email);
  if (check.status === "unavailable") return "unavailable";
  const checked = new Date().toISOString();
  if (check.status === "none") {
    await admin.from("profiles").update({ license_valid_until: null, license_plan: null, license_order_id: null, license_checked_at: checked }).eq("user_id", user.id).eq("role", "organizador");
    return "none";
  }
  const { error } = await admin.from("profiles")
    .update({ license_valid_until: check.until ?? "infinity", license_plan: check.plan, license_order_id: check.orderId, license_checked_at: checked })
    .eq("user_id", user.id).eq("role", "organizador");
  if (error?.code === "23505") return "conflict";
  return error ? "unavailable" : "valid";
}
