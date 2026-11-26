import { createServerSupabase } from "@/lib/supabase/server";
import type { PaymentFilters } from "@/lib/payment-filters";

// Pagos del organizador (KIN-754). Se leen con su sesión y SIEMPRE filtrando por sus eventos: las reglas de la base también le devuelven sus
// propias inscripciones en eventos de otros (cuando además compite), y eso no es dinero que él cobre (KIN-627).
// Solo cuentan las inscripciones pendientes y pagadas (una reembolsada ya no es dinero esperado).

export type PaymentEventTotals = { slug: string; name: string; date: string | null; venue: string; expectedCents: number; paidCents: number; pendingCents: number; paidCount: number; pendingCount: number };

type TotalsRow = { payment_status: string; amount_cents: number; events: { slug: string | null; name: string; event_date: string | null; venue: string | null } | null; event_id: string };

const PAGE = 1000; // tope de filas por consulta de la API
const MAX_PAGES = 50; // 50 000 inscripciones: más que cualquier organizador; evita un ciclo sin fin si algo falla

// Totales por evento: esperado (pendiente + pagado), pagado y pendiente. Se suman en el servidor leyendo solo tres columnas por inscripción.
export async function listPaymentTotals(organizerId: string): Promise<PaymentEventTotals[]> {
  const supabase = await createServerSupabase();
  const byEvent = new Map<string, PaymentEventTotals>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase.from("registrations")
      .select("event_id, payment_status, amount_cents, events!inner(slug, name, event_date, venue)")
      .eq("events.organizer_id", organizerId).in("payment_status", ["pendiente", "pagado"]).order("id").range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`No se pudieron leer los pagos: ${error.message}`);
    const rows = (data ?? []) as unknown as TotalsRow[];
    for (const r of rows) {
      if (!r.events?.slug) continue;
      const t = byEvent.get(r.event_id) ?? { slug: r.events.slug, name: r.events.name, date: r.events.event_date, venue: r.events.venue ?? "", expectedCents: 0, paidCents: 0, pendingCents: 0, paidCount: 0, pendingCount: 0 };
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
export async function listPaymentRows(organizerId: string, f: PaymentFilters): Promise<{ rows: PaymentRow[]; total: number }> {
  const supabase = await createServerSupabase();
  let q = supabase.from("registrations")
    .select("id, payment_status, payment_method, amount_cents, role, created_at, paid_at, events!inner(slug, name), event_categories(name), ropers!inner(full_name)", { count: "exact" })
    .eq("events.organizer_id", organizerId)
    .in("payment_status", f.status === "todos" ? ["pendiente", "pagado"] : [f.status]);
  if (f.event) q = q.eq("events.slug", f.event);
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
