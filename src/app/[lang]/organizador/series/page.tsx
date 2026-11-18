import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { listOrganizerSeries } from "@/lib/data/series";
import { eventPhase } from "@/lib/event-time";
import { fmtDate } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Session } from "@/lib/session";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

async function List({ s, lang, t, deleted }: { s: Session; lang: Lang; t: Dict; deleted: boolean }) {
  const all = await listOrganizerSeries(s.id);
  const m = t.org.series;
  return (
    <>
      <OrgNav lang={lang} t={t} admin={s.isAdmin} />
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">{m.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">{m.blurb}</p>
          </div>
          {s.verified ? <Link href={`/${lang}/organizador/series/nueva`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{m.newSeries}</Link> : <span className="rounded-full bg-sand px-5 py-2.5 text-sm font-medium text-muted">{m.newSeries}</span>}
        </div>
        {deleted && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{m.deleted}</p>}
        {all.length === 0 ? <p className="mt-6 rounded-2xl bg-sand p-6 text-center text-muted">{m.none}</p> : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {all.map(({ series, events }) => {
              const open = events.filter((e) => eventPhase({ status: e.status, enrolled: e.enrolled, capacity: e.capacity, opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed }) === "open").length;
              return (
                <Link key={series.uuid} href={`/${lang}/organizador/series/${series.id}`} className="card block p-5">
                  <p className="text-lg font-semibold leading-snug">{series.name}</p>
                  <p className="mt-1 text-sm text-muted">{fmtDate(series.startDate, lang)} – {fmtDate(series.endDate, lang)}</p>
                  <p className="mt-3 text-sm"><span className="font-medium tabular-nums">{events.length}</span> {m.eventsCount}{events.length > 0 && <> · <span className="tabular-nums">{open}</span> {t.series.openCount}</>}</p>
                  <p className="mt-3 text-sm font-medium text-brand-hot">{m.manage} →</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

async function Page({ props }: { props: PageProps<"/[lang]/organizador/series"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/series`}>
      {(s) => <List s={s} lang={lang} t={t} deleted={sp.borrada === "1"} />}
    </Gate>
  );
}

export default function SeriesPage(props: PageProps<"/[lang]/organizador/series">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
