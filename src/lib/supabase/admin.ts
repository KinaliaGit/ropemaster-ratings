import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con la llave de servicio: se SALTA las reglas de la base. Solo para código de servidor
// (nunca en componentes de cliente ni con prefijo NEXT_PUBLIC_). Devuelve null si no está configurada.
let client: SupabaseClient | null | undefined;

export function adminClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
