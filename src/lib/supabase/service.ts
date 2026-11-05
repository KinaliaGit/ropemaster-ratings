import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente con la llave de servicio: se salta las reglas de la base. SOLO para el servidor (webhooks) y nunca con datos que mande el navegador
// sin validar. Devuelve null si la llave no está configurada.
export function createServiceSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
