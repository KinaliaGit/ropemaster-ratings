import type { SupabaseClient } from "@supabase/supabase-js";

// Filas PROPIAS de una tabla con `roper_id` (KIN-627). Las reglas de la base NO bastan: al organizador también le dejan leer las filas de
// todos los inscritos de sus eventos, así que "lo mío" se filtra siempre por mi perfil de lazador.
export function ownRows(client: SupabaseClient, table: "registrations" | "registration_removals", columns: string, roperId: string, newestBy: string) {
  return client.from(table).select(columns).eq("roper_id", roperId).order(newestBy, { ascending: false });
}
