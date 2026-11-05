import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente CON la sesión de quien visita (lee la cookie). Las consultas corren con sus permisos: la base decide qué ve.
export async function createServerSupabase() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        // En un Server Component las cookies son de solo lectura; el proxy ya renueva la sesión en cada visita.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* ignorado a propósito */ }
      },
    },
  });
}
