import { createServerSupabase } from "@/lib/supabase/server";

// Resumen del Overview del organizador (KIN-658). Todo sale de UNA función de la base (organizer_overview): conteos y sumas ya hechos, solo de sus
// eventos y series; las listas vienen cortas (máx. 8). Sin caché: es personal.
export type OverviewEvent = { slug: string; name: string; date: string; days: number };
export type OverviewArena = { id: string; name: string; city: string; key: string };
export type Overview = {
  // KIN-762: la arena por la que se filtró el resumen, o null si no hubo filtro (o la llave no es de ninguna arena suya). Contrato: docs/PANEL_ARENAS.md.
  arena: OverviewArena | null;
  series: { slug: string; name: string; start_date: string; end_date: string; events: number; enrolled: number; people: number; only_header: number; only_heeler: number; both_roles: number; no_role: number; next_event: OverviewEvent | null } | null;
  next_event: (OverviewEvent & { capacity: number | null; enrolled: number; only_header: number; only_heeler: number; both_roles: number; no_role: number }) | null;
  payments: { pending: number; paid: number; pending_cents: number; collected_cents: number };
  states: { open: number; scheduled: number; finished: number; draft: number };
  activity: { kind: "enrolled" | "removed"; who: string; event: string; at: string }[];
  todo: { unpaid: { slug: string; name: string; count: number }[]; no_results: { slug: string; name: string; date: string }[]; no_opening: { slug: string; name: string; date: string }[] };
};

// `arena` es la llave de la arena (la misma de `?arena=<llave>`, ver parseArenaParam en src/lib/arena.ts). Vacía o sin pasar = todas sus arenas.
// Una llave que no es de una arena suya no da error: el resumen sale vacío y `arena` es null.
export async function getOrganizerOverview(arena = ""): Promise<Overview | null> {
  const { data, error } = await (await createServerSupabase()).rpc("organizer_overview", arena ? { p_arena: arena } : {});
  if (error || !data) return null;
  return data as Overview;
}
