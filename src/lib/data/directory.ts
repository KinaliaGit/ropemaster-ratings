import { createServerSupabase } from "@/lib/supabase/server";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { fmtRating } from "@/lib/people";
import type { OrgRow } from "@/components/OrgParticipantsTable";

type Row = {
  phone_e164: string; phone_verified: boolean;
  ropers: { id: string; full_name: string; roper_ratings: { discipline: string; rating: number | string; events_count: number; wins: number }[] } | null;
};

// Directorio con celulares. Solo responde a organizadores verificados y administradores: la base devuelve vacío a cualquier otro.
export async function listDirectory(lang: "es" | "en", labels: { verified: string; unclaimed: string }): Promise<OrgRow[]> {
  const { data, error } = await (await createServerSupabase())
    .from("roper_contacts")
    .select("phone_e164, phone_verified, ropers!inner(id, full_name, roper_ratings(discipline, rating, events_count, wins))")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`No se pudo leer el directorio: ${error.message}`);
  return (data as unknown as Row[]).filter((r) => r.ropers).map((r) => {
    const ratings = r.ropers!.roper_ratings;
    const main = ratings.find((x) => x.discipline === ACTIVE_DISCIPLINES[0].id);
    return {
      id: r.ropers!.id, href: `/${lang}/participantes/${r.ropers!.id}`, name: r.ropers!.full_name, phone: r.phone_e164,
      ratings: ACTIVE_DISCIPLINES.map((d) => { const x = ratings.find((y) => y.discipline === d.id); return x ? fmtRating(Number(x.rating)) : "–"; }),
      events: main?.events_count ?? 0, wins: main?.wins ?? 0, profile: r.phone_verified ? `${labels.verified} ✓` : labels.unclaimed,
    };
  });
}

export type OrganizerRow = { userId: string; name: string; email: string | null; verified: boolean; createdAt: string };
export type AuditRow = { id: string; admin: string; target: string; action: "verify" | "revoke"; at: string };

// Organizadores y auditoría para la pantalla de administración (la base solo lo deja ver a administradores).
export async function listOrganizersForAdmin(): Promise<{ organizers: OrganizerRow[]; audit: AuditRow[] }> {
  const supabase = await createServerSupabase();
  const [orgs, audit] = await Promise.all([
    supabase.from("profiles").select("user_id, display_name, email, organizer_verified, created_at").eq("role", "organizador")
      .order("organizer_verified", { ascending: true }).order("created_at", { ascending: false }).limit(500),
    supabase.from("admin_audit").select("id, admin_id, target_user_id, action, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  if (orgs.error) throw new Error(`No se pudieron leer los organizadores: ${orgs.error.message}`);
  const organizers = (orgs.data ?? []).map((p) => ({ userId: p.user_id, name: p.display_name, email: p.email, verified: p.organizer_verified, createdAt: p.created_at }));
  const names = new Map(organizers.map((o) => [o.userId, o.name]));
  return {
    organizers,
    audit: (audit.data ?? []).map((a) => ({ id: a.id, admin: names.get(a.admin_id) ?? "—", target: names.get(a.target_user_id) ?? "—", action: a.action, at: a.created_at })),
  };
}
