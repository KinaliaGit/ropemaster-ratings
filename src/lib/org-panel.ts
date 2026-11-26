// KIN-763: en qué pestaña de «Mis eventos» va cada evento y cuántos se muestran. Recibe el estado ya calculado por fecha.
// Las series van en una cuarta pestaña (KIN-761): no necesitan una lista aparte.
const EVENT_TABS = ["proximos", "pasados", "borradores"] as const;
export const ORG_TABS = [...EVENT_TABS, "series"] as const;
export type OrgTab = (typeof ORG_TABS)[number];
export type EventTab = (typeof EVENT_TABS)[number];
export const ORG_PAGE_SIZE = 20; // «Ver más» suma otra tanda

export const orgTabOf = (status: string): EventTab => (status === "borrador" ? "borradores" : status === "finalizado" ? "pasados" : "proximos");

/** Reparte los eventos: próximos del más cercano al más lejano; pasados y borradores, del más reciente al más antiguo. */
export function groupOrgEvents<E extends { status: string; date: string }>(events: E[]): Record<EventTab, E[]> {
  const groups: Record<EventTab, E[]> = { proximos: [], pasados: [], borradores: [] };
  for (const e of events) groups[orgTabOf(e.status)].push(e);
  for (const tab of EVENT_TABS) groups[tab].sort((a, b) => (tab === "proximos" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
  return groups;
}

/** La pestaña pedida en la URL; sin pedir, la primera que tenga algo. */
export function pickOrgTab(asked: unknown, counts: Record<OrgTab, unknown[]>): OrgTab {
  return ORG_TABS.find((t) => t === asked) ?? ORG_TABS.find((t) => counts[t].length > 0) ?? "proximos";
}

/** `?n=` cuántos mostrar: múltiplos de la tanda, con tope. */
export function parseShown(v: unknown): number {
  const n = typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : ORG_PAGE_SIZE;
  return Math.min(Math.max(n, ORG_PAGE_SIZE), 1000);
}
