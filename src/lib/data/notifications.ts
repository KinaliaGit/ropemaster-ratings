import { createServerSupabase } from "@/lib/supabase/server";
import type { Unread } from "@/lib/notices";

// Avisos de la persona que visita (KIN-657). Sin caché: son personales. La base solo deja leer los propios (RLS) y ya no devuelve los vencidos
// (vistos hace más de 90 días, no vistos de más de un año; los de reembolso pendiente nunca vencen): ver docs/NOTIFICACIONES.md (KIN-772).
export type NotificationItem = { id: string; kind: "removed" | "event_deleted" | "promoted"; eventName: string; eventDate: string | null; reason: string; refundPending: boolean; createdAt: string; read: boolean };

export async function listMyNotifications(limit = 50): Promise<NotificationItem[]> {
  const { data } = await (await createServerSupabase()).from("notifications")
    .select("id, kind, event_name, event_date, reason, refund_pending, created_at, read_at").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id, kind: n.kind, eventName: n.event_name, eventDate: n.event_date, reason: n.reason, refundPending: n.refund_pending, createdAt: n.created_at, read: n.read_at !== null,
  }));
}

/** Sin leer: cuántos y la fecha del más reciente. null si la consulta falla. */
export async function getMyUnread(): Promise<Unread | null> {
  const { data, count, error } = await (await createServerSupabase()).from("notifications")
    .select("created_at", { count: "exact" }).is("read_at", null).order("created_at", { ascending: false }).limit(1);
  return error ? null : { count: count ?? 0, latest: data?.[0]?.created_at ?? null };
}

export const countMyUnread = async () => (await getMyUnread())?.count ?? 0;
