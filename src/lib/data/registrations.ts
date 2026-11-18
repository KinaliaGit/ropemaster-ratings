import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase } from "@/lib/supabase/server";
import { INITIAL_RATING } from "@/lib/rating";
import { ENROLLED_PAGE_SIZE, decodeEnrolledCursor, toEnrolledPage, type EnrolledPage } from "@/lib/enrolled";

// ---- Públicas (en caché; se invalidan con updateTag("registrations") al inscribirse o cancelar) ----
// Salen de funciones de la base que solo responden por eventos publicados y no exponen pagos ni la tabla.

// Los conteos solo cambian al inscribirse, cancelar o editar un evento, y esas acciones invalidan la etiqueta: pueden guardarse varios minutos.
export async function getEnrollmentCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheTag("registrations");
  cacheLife("minutes");
  const { data, error } = await createPublicClient().rpc("event_registration_counts");
  if (error) throw new Error(`No se pudieron leer los inscritos: ${error.message}`);
  return Object.fromEntries((data ?? []).map((r: { event_id: string; n: number }) => [r.event_id, r.n]));
}

// Inscritos de UN evento (el del slug), sin calcular los de los demás (KIN-612).
export async function getEventEnrolled(slug: string): Promise<number> {
  "use cache";
  cacheTag("registrations");
  cacheLife("minutes");
  const { data, error } = await createPublicClient().rpc("event_enrolled", { p_slug: slug });
  if (error) throw new Error(`No se pudieron leer los inscritos: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

// Inscritos de un evento, UNA PÁGINA a la vez y ya con nombre, foto y rating de su modalidad (sin repetir a quien está en dos categorías).
// `cursor` es el que entregó la página anterior (ya validado por quien llama). Se invalida con los inscritos y con los perfiles.
export async function getEventRegistrants(eventUuid: string, discipline: string, cursor: string | null = null): Promise<EnrolledPage> {
  "use cache";
  cacheTag("registrations", "ropers");
  cacheLife("minutes");
  const decoded = decodeEnrolledCursor(cursor);
  const at = decoded.ok ? decoded.cursor : null;
  const { data, error } = await createPublicClient().rpc("event_registrants_page", {
    p_event: eventUuid, p_discipline: discipline, p_initial: INITIAL_RATING, p_after_at: at?.at ?? null, p_after_id: at?.id ?? null, p_limit: ENROLLED_PAGE_SIZE + 1,
  });
  if (error) throw new Error(`No se pudo leer la lista de inscritos: ${error.message}`);
  return toEnrolledPage((data ?? []) as Parameters<typeof toEnrolledPage>[0], ENROLLED_PAGE_SIZE);
}

// ---- Con sesión (las reglas de la base deciden qué ve cada quien) ----

export type MyRegistration = {
  id: string; paymentStatus: string; paymentMethod: string | null; amountCents: number; category: string; role: string | null;
  event: { slug: string | null; name: string; date: string | null; city: string | null; paymentInfo: string | null; closesAt: string | null; timezone: string; registrationClosed: boolean; status: string } | null;
};

export async function listMyRegistrations(): Promise<MyRegistration[]> {
  const { data, error } = await (await createServerSupabase()).from("registrations")
    .select("id, payment_status, payment_method, amount_cents, role, event_categories(name), events(slug, name, event_date, city, registration_closes_at, registration_closed, status, timezone, event_payment_info(instructions))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer tus inscripciones: ${error.message}`);
  type Info = { instructions: string } | { instructions: string }[] | null;
  type Row = { id: string; payment_status: string; payment_method: string | null; amount_cents: number; role: string | null; event_categories: { name: string } | null; events: { slug: string | null; name: string; event_date: string | null; city: string | null; registration_closes_at: string | null; registration_closed: boolean; status: string; timezone: string; event_payment_info: Info } | null };
  const info = (i: Info | undefined) => (Array.isArray(i) ? i[0]?.instructions : i?.instructions) ?? null; // solo lo ven los inscritos (la base lo decide)
  return (data as unknown as Row[]).map((r) => ({
    id: r.id, paymentStatus: r.payment_status, paymentMethod: r.payment_method, amountCents: r.amount_cents, category: r.event_categories?.name ?? "", role: r.role,
    event: r.events ? { slug: r.events.slug, name: r.events.name, date: r.events.event_date, city: r.events.city, paymentInfo: info(r.events.event_payment_info), closesAt: r.events.registration_closes_at, timezone: r.events.timezone, registrationClosed: r.events.registration_closed, status: r.events.status } : null,
  }));
}

export type EventRegistration = { id: string; roperId: string; name: string; category: string; role: string | null; paymentStatus: string; paymentMethod: string | null; amountCents: number; email: string | null };

// Inscritos de un evento del organizador. El correo solo llega si es organizador verificado (la base lo decide).
export async function listEventRegistrations(eventUuid: string): Promise<EventRegistration[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("registrations")
    .select("id, roper_id, payment_status, payment_method, amount_cents, role, event_categories(name), ropers(full_name)")
    .eq("event_id", eventUuid).order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron leer los inscritos: ${error.message}`);
  type Row = { id: string; roper_id: string; payment_status: string; payment_method: string | null; amount_cents: number; role: string | null; event_categories: { name: string } | null; ropers: { full_name: string } | null };
  const rows = data as unknown as Row[];
  const ids = [...new Set(rows.map((r) => r.roper_id))];
  const { data: contacts } = ids.length ? await supabase.from("roper_contacts").select("roper_id, email").in("roper_id", ids) : { data: [] };
  const emails = new Map((contacts ?? []).map((c) => [c.roper_id, c.email]));
  return rows.map((r) => ({
    id: r.id, roperId: r.roper_id, name: r.ropers?.full_name ?? "—", category: r.event_categories?.name ?? "", role: r.role,
    paymentStatus: r.payment_status, paymentMethod: r.payment_method, amountCents: r.amount_cents, email: emails.get(r.roper_id) ?? null,
  }));
}

// Instrucciones de pago de un evento propio (para editarlas).
export async function getPaymentInstructions(eventUuid: string): Promise<string> {
  const { data } = await (await createServerSupabase()).from("event_payment_info").select("instructions").eq("event_id", eventUuid).maybeSingle();
  return data?.instructions ?? "";
}

// ---- Inscritos sacados del evento (KIN-621) ----

export type Removal = {
  id: string; roperId: string; name: string; category: string; reason: string; removedAt: string; paymentStatus: string; paymentMethod: string | null;
  amountCents: number; refundPending: boolean; refundDoneAt: string | null; canReenroll: boolean;
};

// Sacados de un evento propio, del más reciente al más antiguo (la base solo deja verlos al organizador del evento y a un admin).
export async function listEventRemovals(eventUuid: string): Promise<Removal[]> {
  const { data, error } = await (await createServerSupabase()).from("registration_removals")
    .select("id, roper_id, category_name, reason, removed_at, payment_status, payment_method, amount_cents, refund_pending, refund_done_at, can_reenroll, ropers(full_name)")
    .eq("event_id", eventUuid).order("removed_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los sacados del evento: ${error.message}`);
  type Row = { id: string; roper_id: string; category_name: string; reason: string; removed_at: string; payment_status: string; payment_method: string | null; amount_cents: number; refund_pending: boolean; refund_done_at: string | null; can_reenroll: boolean; ropers: { full_name: string } | null };
  return (data as unknown as Row[]).map((r) => ({
    id: r.id, roperId: r.roper_id, name: r.ropers?.full_name ?? "—", category: r.category_name, reason: r.reason, removedAt: r.removed_at, paymentStatus: r.payment_status,
    paymentMethod: r.payment_method, amountCents: r.amount_cents, refundPending: r.refund_pending, refundDoneAt: r.refund_done_at, canReenroll: r.can_reenroll,
  }));
}

export type MyRemoval = { id: string; event: { slug: string | null; name: string } | null; category: string; reason: string; removedAt: string; refundPending: boolean; canReenroll: boolean };

// Eventos de los que me sacaron, con el motivo. La base solo devuelve los míos; el evento puede no verse si volvió a borrador.
export async function listMyRemovals(): Promise<MyRemoval[]> {
  const { data, error } = await (await createServerSupabase()).from("registration_removals")
    .select("id, category_name, reason, removed_at, refund_pending, can_reenroll, events(slug, name)").order("removed_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer tus bajas: ${error.message}`);
  type Row = { id: string; category_name: string; reason: string; removed_at: string; refund_pending: boolean; can_reenroll: boolean; events: { slug: string | null; name: string } | null };
  return (data as unknown as Row[]).map((r) => ({ id: r.id, event: r.events, category: r.category_name, reason: r.reason, removedAt: r.removed_at, refundPending: r.refund_pending, canReenroll: r.can_reenroll }));
}
