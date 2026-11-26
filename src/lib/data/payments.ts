import { createServerSupabase } from "@/lib/supabase/server";
import type { PaymentFilters } from "@/lib/payment-filters";
import { buildPaymentSummary, type EventPaymentSummary, type PaymentEventTotals, type SummaryEvent } from "@/lib/payment-summary";

export type { EventPaymentSummary, PaymentEventTotals } from "@/lib/payment-summary";

// Pagos del organizador (KIN-754). Se leen con su sesión y SIEMPRE filtrando por sus eventos: las reglas de la base también le devuelven sus
// propias inscripciones en eventos de otros (cuando además compite), y eso no es dinero que él cobre (KIN-627).
// Solo cuentan las inscripciones pendientes y pagadas (una reembolsada ya no es dinero esperado).
// Filtro por arena (KIN-765): `arenaId` es el id de una arena del propio organizador (se resuelve desde su catálogo, que las reglas de la base ya
// limitan a lo suyo); con `null` no se filtra. El filtro se aplica en la consulta, así totales, lista y resumen siempre salen del mismo conjunto.

type TotalsRow = { payment_status: string; amount_cents: number; events: { slug: string | null; name: string; event_date: string | null } | null; event_id: string };

const PAGE = 1000; // tope de filas por consulta de la API
const MAX_PAGES = 50; // 50 000 inscripciones: más que cualquier organizador; evita un ciclo sin fin si algo falla

// Totales por evento: esperado (pendiente + pagado), pagado y pendiente. Se suman en el servidor leyendo solo tres columnas por inscripción.
export async function listPaymentTotals(organizerId: string, arenaId: string | null = null): Promise<PaymentEventTotals[]> {
  const supabase = await createServerSupabase();
  const byEvent = new Map<string, PaymentEventTotals>();
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = supabase.from("registrations")
      .select("event_id, payment_status, amount_cents, events!inner(slug, name, event_date)")
      .eq("events.organizer_id", organizerId).in("payment_status", ["pendiente", "pagado"]);
    if (arenaId) q = q.eq("events.arena_id", arenaId);
    const { data, error } = await q.order("id").range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`No se pudieron leer los pagos: ${error.message}`);
    const rows = (data ?? []) as unknown as TotalsRow[];
    for (const r of rows) {
      if (!r.events?.slug) continue;
      const t = byEvent.get(r.event_id) ?? { eventId: r.event_id, slug: r.events.slug, name: r.events.name, date: r.events.event_date, expectedCents: 0, paidCents: 0, pendingCents: 0, paidCount: 0, pendingCount: 0 };
      t.expectedCents += r.amount_cents;
      if (r.payment_status === "pagado") { t.paidCents += r.amount_cents; t.paidCount++; } else { t.pendingCents += r.amount_cents; t.pendingCount++; }
      byEvent.set(r.event_id, t);
    }
    if (rows.length < PAGE) break;
  }
  return [...byEvent.values()].sort((a, b) => (b.pendingCents - a.pendingCents) || (b.date ?? "").localeCompare(a.date ?? "") || a.name.localeCompare(b.name));
}

export type PaymentRow = {
  id: string; eventSlug: string; eventName: string; name: string; category: string; role: string | null;
  status: string; method: string | null; amountCents: number; createdAt: string; paidAt: string | null;
};
export const PAYMENT_ROWS_LIMIT = 200;

type ListRow = {
  id: string; payment_status: string; payment_method: string | null; amount_cents: number; role: string | null; created_at: string; paid_at: string | null;
  events: { slug: string; name: string } | null; event_categories: { name: string } | null; ropers: { full_name: string } | null;
};

// Quién debe (o ya pagó): una fila por inscripción, de la más antigua a la más reciente, con filtros por evento, estado y nombre.
// Devuelve como máximo PAYMENT_ROWS_LIMIT filas y el total que coincide, para avisar cuando falten por mostrar.
export async function listPaymentRows(organizerId: string, f: PaymentFilters, arenaId: string | null = null): Promise<{ rows: PaymentRow[]; total: number }> {
  const supabase = await createServerSupabase();
  let q = supabase.from("registrations")
    .select("id, payment_status, payment_method, amount_cents, role, created_at, paid_at, events!inner(slug, name), event_categories(name), ropers!inner(full_name)", { count: "exact" })
    .eq("events.organizer_id", organizerId)
    .in("payment_status", f.status === "todos" ? ["pendiente", "pagado"] : [f.status]);
  if (f.event) q = q.eq("events.slug", f.event);
  if (arenaId) q = q.eq("events.arena_id", arenaId);
  const term = f.q.trim().replace(/[%_\\,()]/g, " ").replace(/\s+/g, " ").trim();
  if (term) q = q.ilike("ropers.full_name", `%${term}%`);
  const { data, error, count } = await q.order("created_at", { ascending: true }).order("id").limit(PAYMENT_ROWS_LIMIT);
  if (error) throw new Error(`No se pudieron leer los pagos: ${error.message}`);
  const rows = ((data ?? []) as unknown as ListRow[]).map((r) => ({
    id: r.id, eventSlug: r.events?.slug ?? "", eventName: r.events?.name ?? "", name: r.ropers?.full_name ?? "—", category: r.event_categories?.name ?? "", role: r.role,
    status: r.payment_status, method: r.payment_method, amountCents: r.amount_cents, createdAt: r.created_at, paidAt: r.paid_at,
  }));
  return { rows, total: count ?? rows.length };
}

type SummaryEventRow = { id: string; slug: string | null; name: string; event_date: string | null; status: string; arenas: { id: string; name: string } | null };

// Resumen de pagos por evento para el panel (KIN-765): una fila por evento del organizador (también los que no tienen inscripciones, con ceros) con
// inscripciones pagadas, pendientes y en lista de espera. Los números salen de `listPaymentTotals`, la misma suma de la pantalla de Pagos, así que
// no pueden diferir. Con `arenaId` solo trae los eventos de esa arena. Forma documentada en docs/DISENO.md (sección «Resumen de pagos por evento»).
export async function listEventPaymentSummary(organizerId: string, arenaId: string | null = null): Promise<EventPaymentSummary[]> {
  const supabase = await createServerSupabase();
  let evQ = supabase.from("events").select("id, slug, name, event_date, status, arenas(id, name)").eq("organizer_id", organizerId);
  if (arenaId) evQ = evQ.eq("arena_id", arenaId);
  const [{ data: evs, error }, totals, waitlist] = await Promise.all([evQ.order("id").limit(PAGE), listPaymentTotals(organizerId, arenaId), listWaitlistCounts(organizerId, arenaId)]);
  if (error) throw new Error(`No se pudieron leer los eventos: ${error.message}`);
  const events: SummaryEvent[] = ((evs ?? []) as unknown as SummaryEventRow[]).filter((e) => e.slug)
    .map((e) => ({ id: e.id, slug: e.slug!, name: e.name, date: e.event_date, status: e.status, arena: e.arenas ? { id: e.arenas.id, name: e.arenas.name } : null }));
  return buildPaymentSummary(events, totals, waitlist);
}

// Personas en lista de espera por evento (tabla aparte de `registrations`: no cuentan en cupo ni en dinero). Las reglas de la base solo dejan leer
// la lista de los eventos propios; el filtro por organizador se repite aquí porque la persona que también compite ve su propia fila en eventos ajenos.
async function listWaitlistCounts(organizerId: string, arenaId: string | null): Promise<Map<string, number>> {
  const supabase = await createServerSupabase();
  const counts = new Map<string, number>();
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = supabase.from("event_waitlist").select("id, event_id, events!inner(organizer_id)").eq("events.organizer_id", organizerId);
    if (arenaId) q = q.eq("events.arena_id", arenaId);
    const { data, error } = await q.order("id").range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`No se pudo leer la lista de espera: ${error.message}`);
    const rows = (data ?? []) as unknown as { event_id: string }[];
    for (const r of rows) counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
    if (rows.length < PAGE) break;
  }
  return counts;
}
