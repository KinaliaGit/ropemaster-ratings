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
  id: string; paymentStatus: string; paymentMethod: string | null; amountCents: number; category: string;
  event: { slug: string | null; name: string; date: string | null; city: string | null; paymentInfo: string | null } | null;
};

export async function listMyRegistrations(): Promise<MyRegistration[]> {
  const { data, error } = await (await createServerSupabase()).from("registrations")
    .select("id, payment_status, payment_method, amount_cents, event_categories(name), events(slug, name, event_date, city, event_payment_info(instructions))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer tus inscripciones: ${error.message}`);
  type Info = { instructions: string } | { instructions: string }[] | null;
  type Row = { id: string; payment_status: string; payment_method: string | null; amount_cents: number; event_categories: { name: string } | null; events: { slug: string | null; name: string; event_date: string | null; city: string | null; event_payment_info: Info } | null };
  const info = (i: Info | undefined) => (Array.isArray(i) ? i[0]?.instructions : i?.instructions) ?? null; // solo lo ven los inscritos (la base lo decide)
  return (data as unknown as Row[]).map((r) => ({
    id: r.id, paymentStatus: r.payment_status, paymentMethod: r.payment_method, amountCents: r.amount_cents, category: r.event_categories?.name ?? "",
    event: r.events ? { slug: r.events.slug, name: r.events.name, date: r.events.event_date, city: r.events.city, paymentInfo: info(r.events.event_payment_info) } : null,
  }));
}

export type EventRegistration = { id: string; roperId: string; name: string; category: string; paymentStatus: string; paymentMethod: string | null; amountCents: number; email: string | null };

// Inscritos de un evento del organizador. El correo solo llega si es organizador verificado (la base lo decide).
export async function listEventRegistrations(eventUuid: string): Promise<EventRegistration[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("registrations")
    .select("id, roper_id, payment_status, payment_method, amount_cents, event_categories(name), ropers(full_name)")
    .eq("event_id", eventUuid).order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron leer los inscritos: ${error.message}`);
  type Row = { id: string; roper_id: string; payment_status: string; payment_method: string | null; amount_cents: number; event_categories: { name: string } | null; ropers: { full_name: string } | null };
  const rows = data as unknown as Row[];
  const ids = [...new Set(rows.map((r) => r.roper_id))];
  const { data: contacts } = ids.length ? await supabase.from("roper_contacts").select("roper_id, email").in("roper_id", ids) : { data: [] };
  const emails = new Map((contacts ?? []).map((c) => [c.roper_id, c.email]));
  return rows.map((r) => ({
    id: r.id, roperId: r.roper_id, name: r.ropers?.full_name ?? "—", category: r.event_categories?.name ?? "",
    paymentStatus: r.payment_status, paymentMethod: r.payment_method, amountCents: r.amount_cents, email: emails.get(r.roper_id) ?? null,
  }));
}

// Instrucciones de pago de un evento propio (para editarlas).
export async function getPaymentInstructions(eventUuid: string): Promise<string> {
  const { data } = await (await createServerSupabase()).from("event_payment_info").select("instructions").eq("event_id", eventUuid).maybeSingle();
  return data?.instructions ?? "";
}
