// KIN-770: «Mis próximos eventos» junta inscripciones (pagadas y pendientes) y lugares en lista de espera en una sola lista.
type Dated = { event: { date: string | null } | null };

export type UpcomingItem<R extends Dated, W extends Dated> = { kind: "registration"; item: R } | { kind: "waitlist"; item: W };

/** Del evento más cercano al más lejano; los que no tienen fecha van al final. En la misma fecha, la inscripción va antes que la espera. */
export function mergeUpcoming<R extends Dated, W extends Dated>(registrations: R[], waiting: W[]): UpcomingItem<R, W>[] {
  const all: UpcomingItem<R, W>[] = [
    ...registrations.map((item) => ({ kind: "registration" as const, item })),
    ...waiting.map((item) => ({ kind: "waitlist" as const, item })),
  ];
  const key = (x: UpcomingItem<R, W>) => x.item.event?.date || "9999-99-99";
  return all.sort((a, b) => key(a).localeCompare(key(b)));
}

/** Día y mes corto de una fecha `AAAA-MM-DD` (sin correrse por zona horaria); null si no hay fecha. */
export function dateBlock(date: string | null | undefined, lang: "es" | "en"): { day: string; month: string } | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { ...o, timeZone: "UTC" }).format(d);
  return { day: part({ day: "numeric" }), month: part({ month: "short" }).replace(".", "") };
}

/**
 * Inscripciones pasadas que aún no salen en los resultados, para no repetir el mismo evento en «Eventos pasados». Los resultados llegan por
 * páginas, del más nuevo al más viejo: si quedan más por cargar (`hasMore`), de lo anterior al último cargado no se puede saber y no se lista.
 */
export function pastWithoutResults<R extends { event: { slug: string | null; date: string | null } | null }>(
  registrations: R[], results: { slug: string | null; date: string }[], hasMore: boolean,
): R[] {
  const withResult = new Set(results.map((r) => r.slug).filter(Boolean));
  const oldest = results.reduce<string | null>((min, r) => (min === null || r.date < min ? r.date : min), null);
  return registrations.filter((x) => {
    if (x.event?.slug && withResult.has(x.event.slug)) return false;
    return !hasMore || oldest === null || (x.event?.date ?? "") >= oldest;
  });
}
