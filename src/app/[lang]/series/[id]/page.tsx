import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicSeries } from "@/lib/data/series";
import { eventPhase, statusByDate, fmtDeadline } from "@/lib/event-time";
import { fmtDate, type Lang } from "@/lib/format";
import { PhaseBadge } from "@/components/PhaseBadge";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function SerieInner({ params }: { params: PageProps<"/[lang]/series/[id]">["params"] }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang: Lang = await resolveLang(params);
  const { id } = await params;
  const t = getDictionary(lang);
  const found = await getPublicSeries(id);
  if (!found) notFound();
  const { series: x, events } = found;
  return (
    <div className="mx-auto max-w-4xl px-5 pb-12 pt-8">
      <p className="label">{t.series.label}</p>
      <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{x.name}</h1>
      <p className="mt-2 text-muted">{t.series.dates} {fmtDate(x.startDate, lang)} {t.series.to} {fmtDate(x.endDate, lang)} · <span className="tabular-nums">{events.length}</span> {t.series.eventsCount}</p>
      {x.organizer && <p className="mt-1 text-sm text-muted">{t.series.organizedBy} {x.organizer}</p>}
      {x.description && <p className="mt-6 max-w-2xl whitespace-pre-line text-lg">{x.description}</p>}

      <h2 className="mt-10 text-xl font-semibold">{t.series.eventsTitle}</h2>
      {events.length === 0 ? <p className="mt-3 text-muted">{t.series.noEvents}</p> : (
        <ol className="mt-4 space-y-3">
          {events.map((e, i) => {
            const phase = eventPhase({ status: statusByDate(e), enrolled: e.enrolled, capacity: e.capacity, opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed });
            return (
              <li key={e.uuid}>
                <Link href={`/${lang}/eventos/${e.id}`} className="card block p-4 transition hover:border-ink">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand text-sm font-semibold tabular-nums">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm tabular-nums text-muted">{e.date ? fmtDate(e.date, lang) : "–"}</p>
                        <p className="font-semibold leading-snug">{e.name}</p>
                        <p className="mt-0.5 text-sm text-muted">{[e.venue, e.city].filter(Boolean).join(", ")}</p>
                        <p className="mt-1 text-sm text-muted">
                          <span className="tabular-nums">{e.enrolled}/{e.capacity}</span> {t.series.enrolled}
                          {phase === "upcoming" && e.registrationOpensAt && <>{" · "}{t.series.opensOn} {fmtDeadline(e.registrationOpensAt, e.timezone, lang)}</>}
                          {phase === "open" && e.registrationClosesAt && <>{" · "}{t.series.closesOn} {fmtDeadline(e.registrationClosesAt, e.timezone, lang)}</>}
                        </p>
                      </div>
                    </div>
                    <PhaseBadge phase={phase} label={t.series.phase[phase]} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default function Serie(props: PageProps<"/[lang]/series/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><SerieInner params={props.params} /></Suspense>;
}
