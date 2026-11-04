import { createClient } from "@supabase/supabase-js";

// Cliente SIN sesión, para leer datos públicos (eventos publicados). Se usa dentro de funciones con `use cache`,
// que no pueden leer cookies. Solo ve lo que las reglas de la base permiten a un anónimo.
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
