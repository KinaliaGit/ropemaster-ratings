// Resumen de pagos por evento (KIN-765): el contrato que consume el panel del organizador (H03). Este archivo NO importa nada a propósito: es la
// forma de los datos y la regla que junta las tres fuentes (eventos, totales de inscripciones y lista de espera), así se prueba directo con node.
// Quien lee de la base es `listEventPaymentSummary` (src/lib/data/payments.ts); el panel solo muestra lo que devuelve, sin recalcular dinero.

// Totales de inscripciones de UN evento, sumados desde `registrations` (los de `PaymentEventTotals`, la estructura de la pantalla de Pagos, la
// cumplen tal cual). Solo cuentan `pendiente` y `pagado`: una inscripción reembolsada ya no es dinero esperado. Se cruzan con el evento por su `slug`.
export type PaymentTotalsInput = { slug: string; expectedCents: number; paidCents: number; pendingCents: number; paidCount: number; pendingCount: number };

export type SummaryEvent = { id: string; slug: string; name: string; date: string | null; status: string; arena: { id: string; name: string } | null };

export type EventPaymentSummary = {
  eventId: string;
  slug: string;
  name: string;
  date: string | null; // "AAAA-MM-DD" o null si el evento aún no tiene fecha
  status: string; // "borrador" | "publicado" | "finalizado"
  arena: { id: string; name: string } | null; // null: evento sin arena enlazada (anterior al catálogo o arena borrada)
  paidCount: number; // inscripciones pagadas
  pendingCount: number; // inscripciones pendientes de pago
  waitlistCount: number; // personas en lista de espera: no cuentan en cupo ni en dinero
  paidCents: number;
  pendingCents: number;
  expectedCents: number; // pagado + pendiente (nunca incluye a quien espera ni reembolsos)
};

// Junta los eventos con sus totales y su lista de espera. Un evento sin inscripciones ni espera sale con ceros (no se omite), y los totales de un
// evento que no está en la lista (otra arena, por ejemplo) se ignoran. Orden: fecha más reciente primero (sin fecha al final) y luego nombre.
export function buildPaymentSummary(events: ReadonlyArray<SummaryEvent>, totals: ReadonlyArray<PaymentTotalsInput>, waitlist: ReadonlyMap<string, number>): EventPaymentSummary[] {
  const bySlug = new Map(totals.map((t) => [t.slug, t]));
  return events.map((e) => {
    const t = bySlug.get(e.slug);
    return {
      eventId: e.id, slug: e.slug, name: e.name, date: e.date, status: e.status, arena: e.arena,
      paidCount: t?.paidCount ?? 0, pendingCount: t?.pendingCount ?? 0, waitlistCount: waitlist.get(e.id) ?? 0,
      paidCents: t?.paidCents ?? 0, pendingCents: t?.pendingCents ?? 0, expectedCents: t?.expectedCents ?? 0,
    };
  }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.name.localeCompare(b.name));
}
