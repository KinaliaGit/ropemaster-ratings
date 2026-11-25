import { createServerSupabase } from "@/lib/supabase/server";

// Avisos de la persona que visita (KIN-657). Sin caché: son personales. La base solo deja leer los propios (RLS).
export type NotificationItem = { id: string; kind: "removed" | "event_deleted" | "promoted"; eventName: string; eventDate: string | null; reason: string; refundPending: boolean; createdAt: string; read: boolean };

export async function listMyNotifications(limit = 50): Promise<NotificationItem[]> {
  const { data } = await (await createServerSupabase()).from("notifications")
    .select("id, kind, event_name, event_date, reason, refund_pending, created_at, read_at").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id, kind: n.kind, eventName: n.event_name, eventDate: n.event_date, reason: n.reason, refundPending: n.refund_pending, createdAt: n.created_at, read: n.read_at !== null,
  }));
}

export async function countMyUnread(): Promise<number> {
  const { count } = await (await createServerSupabase()).from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}
