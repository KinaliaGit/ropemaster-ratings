import { createServerSupabase } from "@/lib/supabase/server";

// Resumen del Overview del organizador (KIN-658). Todo sale de UNA función de la base (organizer_overview): conteos y sumas ya hechos, solo de sus
// eventos y series; las listas vienen cortas (máx. 8). Sin caché: es personal.
export type OverviewEvent = { slug: string; name: string; date: string; days: number };
export type Overview = {
  series: { slug: string; name: string; start_date: string; end_date: string; events: number; enrolled: number; next_event: OverviewEvent | null } | null;
  next_event: (OverviewEvent & { capacity: number | null; enrolled: number; only_header: number; only_heeler: number; both_roles: number; no_role: number }) | null;
  payments: { pending: number; paid: number; pending_cents: number; collected_cents: number };
  states: { open: number; scheduled: number; finished: number; draft: number };
  activity: { kind: "enrolled" | "removed"; who: string; event: string; at: string }[];
  todo: { unpaid: { slug: string; name: string; count: number }[]; no_results: { slug: string; name: string; date: string }[]; no_opening: { slug: string; name: string; date: string }[] };
};

export async function getOrganizerOverview(): Promise<Overview | null> {
  const { data, error } = await (await createServerSupabase()).rpc("organizer_overview");
  if (error || !data) return null;
  return data as Overview;
}
