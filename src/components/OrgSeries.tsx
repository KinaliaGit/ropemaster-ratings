import Link from "next/link";
import { eventPhase } from "@/lib/event-time";
import { fmtDate, type Lang } from "@/lib/format";
import type { listOrganizerSeries } from "@/lib/data/series";
import type { Dict } from "@/dictionaries/es";

type Item = Awaited<ReturnType<typeof listOrganizerSeries>>[number];

// Pestaña «Series» del panel (KIN-761): cada serie con sus fechas, cuántos eventos tiene y cuántos están abiertos.
export function OrgSeries({ items, lang, t }: { items: Item[]; lang: Lang; t: Dict }) {
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2 [&>:only-child]:col-span-full">
      {items.map(({ series, events }) => {
        const open = events.filter((e) => eventPhase({ status: e.status, enrolled: e.enrolled, capacity: e.capacity, opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed }) === "open").length;
        return (
          <Link key={series.uuid} href={`/${lang}/organizador/series/${series.id}`} className="card group flex items-center justify-between gap-3 p-4 transition hover:border-ink">
            <span className="min-w-0">
              <span className="block break-words font-semibold leading-snug">{series.name}</span>
              <span className="mt-0.5 block text-sm text-muted">{fmtDate(series.startDate, lang)} – {fmtDate(series.endDate, lang)}</span>
              <span className="mt-1 block text-[13px] tabular-nums text-muted">{t.org.panel.seriesEvents(events.length)}{events.length > 0 ? ` · ${t.org.panel.seriesOpen(open)}` : ""}</span>
            </span>
            <span className="shrink-0 rounded-full bg-sand px-3 py-1.5 text-xs font-medium transition group-hover:bg-brand group-hover:text-white">{t.org.series.manage}</span>
          </Link>
        );
      })}
    </div>
  );
}
