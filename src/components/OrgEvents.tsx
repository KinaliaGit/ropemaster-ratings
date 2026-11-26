import Link from "next/link";
import { AccountEventCard } from "@/components/AccountEventCard";
import { eventPhase, isLiveToday } from "@/lib/event-time";
import type { EventItem } from "@/lib/types";
import type { Lang } from "@/lib/format";
import type { Dict } from "@/dictionaries/es";

export type OrgEventInfo = { paid: number; pending: number; waiting: number; notes: string[] };

// KIN-763: «Mis eventos» del organizador: de un vistazo la fecha, la arena, el estado, cuántos ya pagaron y cuántos esperan lugar. Los números
// vienen de la base (pagos y lista de espera); aquí solo se muestran.
export function OrgEvents({ events, info, lang, t }: { events: EventItem[]; info: (e: EventItem) => OrgEventInfo; lang: Lang; t: Dict }) {
  const o = t.org.panel;
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2 [&>:only-child]:col-span-full">
      {events.map((e) => {
        const { paid, pending, waiting, notes } = info(e);
        const charged = paid + pending;
        const live = isLiveToday(e);
        const phase = eventPhase({ status: e.status, enrolled: e.enrolled, capacity: e.capacity, opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed });
        const pill = "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium";
        const href = `/${lang}/organizador/eventos/${e.id}`;
        return (
          <AccountEventCard key={e.id} date={e.date} lang={lang} name={e.name} href={href} meta={[e.venue, e.city].filter(Boolean).join(", ")} menuLabel={t.account.moreOptions}
            status={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`${pill} ${live ? "bg-red-50 text-red-700" : phase === "finished" ? "bg-ink text-white" : phase === "open" ? "bg-brand-soft text-brand-hot" : "bg-sand text-muted"}`}>{live ? t.home.live : t.home.phase[phase]}</span>
                {!e.series && <span data-testid="individual-mark" className={`${pill} border border-line text-muted`}>{t.series.individual}</span>}
                {notes.map((n) => <span key={n} className={`${pill} bg-amber-50 text-amber-900`}>{n}</span>)}
              </div>
            }>
            <Link href={href} className="mt-1.5 block py-1.5" aria-label={`${t.org.manage}: ${e.name}`}>
              {charged > 0 && <span className="block h-1.5 overflow-hidden rounded-full bg-sand" aria-hidden><span className="block h-full rounded-full bg-emerald-600" style={{ width: `${Math.round((paid / charged) * 100)}%` }} /></span>}
              <span className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[13px] text-muted">
                <span className="tabular-nums">{charged > 0 ? o.paidOf(paid, charged) : o.noEnrolled}{e.capacity > 0 ? ` · ${o.spots(e.enrolled, e.capacity)}` : ""}</span>
                {waiting > 0 && <span className="font-medium tabular-nums text-ink">{o.waiting(waiting)}</span>}
              </span>
            </Link>
          </AccountEventCard>
        );
      })}
    </div>
  );
}
