import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase } from "@/lib/supabase/server";

// ---- Públicas (en caché; se invalidan con updateTag("registrations") al inscribirse o cancelar) ----
// Salen de funciones de la base que solo responden por eventos publicados y no exponen pagos ni la tabla.

export async function getEnrollmentCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheTag("registrations");
  cacheLife("seconds");
  const { data, error } = await createPublicClient().rpc("event_registration_counts");
  if (error) throw new Error(`No se pudieron leer los inscritos: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r: { event_id: string; n: number }) => [r.event_id, r.n]));
}

// Ids de los participantes inscritos (sin repetir a quien está en dos categorías).
export async function getRegistrantIds(eventUuid: string): Promise<string[]> {
  "use cache";
  cacheTag("registrations");
  cacheLife("seconds");
  const { data, error } = await createPublicClient().rpc("event_registrants", { p_event: eventUuid });
  if (error) throw new Error(`No se pudo leer la lista de inscritos: ${error.message}`);
  return [...new Set<string>((data ?? []).map((r: { roper_id: string }) => r.roper_id))];
}

// ---- Con sesión (las reglas de la base deciden qué ve cada quien) ----

export type MyRegistration = {
  id: string; paymentStatus: string; amountCents: number; category: string;
  event: { slug: string | null; name: string; date: string | null; city: string | null } | null;
};

export async function listMyRegistrations(): Promise<MyRegistration[]> {
  const { data, error } = await (await createServerSupabase()).from("registrations")
    .select("id, payment_status, amount_cents, event_categories(name), events(slug, name, event_date, city)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer tus inscripciones: ${error.message}`);
  type Row = { id: string; payment_status: string; amount_cents: number; event_categories: { name: string } | null; events: { slug: string | null; name: string; event_date: string | null; city: string | null } | null };
  return (data as unknown as Row[]).map((r) => ({
    id: r.id, paymentStatus: r.payment_status, amountCents: r.amount_cents, category: r.event_categories?.name ?? "",
    event: r.events ? { slug: r.events.slug, name: r.events.name, date: r.events.event_date, city: r.events.city } : null,
  }));
}

export type EventRegistration = { id: string; roperId: string; name: string; category: string; paymentStatus: string; amountCents: number; email: string | null };

// Inscritos de un evento del organizador. El correo solo llega si es organizador verificado (la base lo decide).
export async function listEventRegistrations(eventUuid: string): Promise<EventRegistration[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("registrations")
    .select("id, roper_id, payment_status, amount_cents, event_categories(name), ropers(full_name)")
    .eq("event_id", eventUuid).order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron leer los inscritos: ${error.message}`);
  type Row = { id: string; roper_id: string; payment_status: string; amount_cents: number; event_categories: { name: string } | null; ropers: { full_name: string } | null };
  const rows = data as unknown as Row[];
  const ids = [...new Set(rows.map((r) => r.roper_id))];
  const { data: contacts } = ids.length ? await supabase.from("roper_contacts").select("roper_id, email").in("roper_id", ids) : { data: [] };
  const emails = new Map((contacts ?? []).map((c) => [c.roper_id, c.email]));
  return rows.map((r) => ({
    id: r.id, roperId: r.roper_id, name: r.ropers?.full_name ?? "—", category: r.event_categories?.name ?? "",
    paymentStatus: r.payment_status, amountCents: r.amount_cents, email: emails.get(r.roper_id) ?? null,
  }));
}
