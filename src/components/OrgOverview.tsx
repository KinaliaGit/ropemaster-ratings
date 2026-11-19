import Link from "next/link";
import { fmtDate, mxn } from "@/lib/format";
import type { Overview } from "@/lib/data/overview";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

// KIN-658: el Overview del organizador como resumen de control. Solo presenta lo que ya calculó la base (ver lib/data/overview.ts).
export function OrgOverview({ o, lang, t }: { o: Overview; lang: Lang; t: Dict }) {
  const v = t.org.overview;
  const empty = !o.series && !o.next_event && o.states.open + o.states.scheduled + o.states.finished + o.states.draft === 0;
  if (empty) {
    return (
      <section aria-labelledby="ov-empty" className="mt-6 rounded-2xl bg-sand p-6 text-center">
        <h2 id="ov-empty" className="text-lg font-semibold">{v.emptyTitle}</h2>
        <p className="mt-1 text-sm text-muted">{v.emptyText}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href={`/${lang}/organizador/series/nueva`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{v.createSeries}</Link>
          <Link href={`/${lang}/organizador/eventos/nuevo`} className="rounded-full bg-white px-5 py-2.5 text-sm font-medium hover:bg-line">{v.createEvent}</Link>
        </div>
      </section>
    );
  }
  const ne = o.next_event;
  const left = ne && ne.capacity ? Math.max(0, ne.capacity - ne.enrolled) : null;
  const roles: [string, number][] = ne ? [[v.header, ne.only_header], [v.heeler, ne.only_heeler], [v.both, ne.both_roles], [v.noRole, ne.no_role]] : [];
  const states: [string, number][] = [[v.open, o.states.open], [v.scheduled, o.states.scheduled], [v.finished, o.states.finished], [v.draft, o.states.draft]];
  const todoCount = o.todo.unpaid.length + o.todo.no_results.length + o.todo.no_opening.length;
  const link = "font-medium text-brand-hot hover:underline";
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <section aria-labelledby="ov-series" className="card p-5">
        <h2 id="ov-series" className="label">{v.nextSeries}</h2>
        {o.series ? (
          <>
            <p className="mt-1 break-words text-xl font-semibold">{o.series.name}</p>
            <p className="text-sm text-muted">{fmtDate(o.series.start_date, lang)} – {fmtDate(o.series.end_date, lang)}</p>
            <p className="mt-2 text-sm"><span className="tabular-nums font-medium">{o.series.events}</span> {v.events} · <span className="tabular-nums font-medium">{o.series.enrolled}</span> {v.enrolledInSeries}</p>
            {o.series.next_event && <p className="mt-2 text-sm">{v.nextEvent}: <Link href={`/${lang}/organizador/eventos/${o.series.next_event.slug}`} className={link}>{o.series.next_event.name}</Link> · {fmtDate(o.series.next_event.date, lang)} ({v.inDays(o.series.next_event.days)})</p>}
            <Link href={`/${lang}/organizador/series/${o.series.slug}`} className={`mt-3 inline-block text-sm ${link}`}>{v.seeSeries} →</Link>
          </>
        ) : <p className="mt-1 text-sm text-muted">{v.noNextEvent}</p>}
      </section>

      <section aria-labelledby="ov-next" className="card p-5">
        <h2 id="ov-next" className="label">{v.nextEvent}</h2>
        {ne ? (
          <>
            <p className="mt-1 break-words text-xl font-semibold">{ne.name}</p>
            <p className="text-sm text-muted">{fmtDate(ne.date, lang)} · {v.inDays(ne.days)}</p>
            <p className="mt-2 text-sm">{v.enrolled}: <span className="tabular-nums font-medium">{ne.enrolled}{ne.capacity ? `/${ne.capacity}` : ""}</span>{left !== null && <span className="text-muted"> · {left === 0 ? v.full : v.spotsLeft(left)}</span>}</p>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-center" aria-label={v.roles}>
              {roles.map(([l, n]) => <div key={l} className="rounded-xl bg-sand p-2"><dd className="text-lg font-semibold tabular-nums">{n}</dd><dt className="text-[11px] text-muted">{l}</dt></div>)}
            </dl>
            <Link href={`/${lang}/organizador/eventos/${ne.slug}`} className={`mt-3 inline-block text-sm ${link}`}>{v.manage} →</Link>
          </>
        ) : <p className="mt-1 text-sm text-muted">{v.noNextEvent}</p>}
      </section>

      <section aria-labelledby="ov-pay" className="card p-5">
        <h2 id="ov-pay" className="label">{v.payments}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <div><dd className="text-2xl font-semibold tabular-nums">{o.payments.pending}</dd><dt className="text-sm text-muted">{v.pending}</dt></div>
          <div><dd className="text-2xl font-semibold tabular-nums">{o.payments.paid}</dd><dt className="text-sm text-muted">{v.paid}</dt></div>
          <div><dd className="text-lg font-semibold tabular-nums">{mxn(o.payments.collected_cents / 100, lang)}</dd><dt className="text-sm text-muted">{v.collected}</dt></div>
          <div><dd className="text-lg font-semibold tabular-nums">{mxn(o.payments.pending_cents / 100, lang)}</dd><dt className="text-sm text-muted">{v.toCollect}</dt></div>
        </dl>
      </section>

      <section aria-labelledby="ov-states" className="card p-5">
        <h2 id="ov-states" className="label">{v.states}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          {states.map(([l, n]) => <div key={l}><dd className="text-2xl font-semibold tabular-nums">{n}</dd><dt className="text-sm text-muted">{l}</dt></div>)}
        </dl>
      </section>

      <section aria-labelledby="ov-todo" className="card p-5">
        <h2 id="ov-todo" className="label">{v.todo}</h2>
        {todoCount === 0 ? <p className="mt-2 text-sm text-muted">{v.allClear}</p> : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {o.todo.unpaid.map((x) => <li key={`u-${x.slug}`}><Link href={`/${lang}/organizador/eventos/${x.slug}`} className={link}>{x.name}</Link> · {v.unpaid(x.count)}</li>)}
            {o.todo.no_results.map((x) => <li key={`r-${x.slug}`}><Link href={`/${lang}/organizador/eventos/${x.slug}`} className={link}>{x.name}</Link> · {v.noResults}</li>)}
            {o.todo.no_opening.map((x) => <li key={`o-${x.slug}`}><Link href={`/${lang}/organizador/eventos/${x.slug}`} className={link}>{x.name}</Link> · {v.noOpening}</li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="ov-act" className="card p-5">
        <h2 id="ov-act" className="label">{v.activity}</h2>
        {o.activity.length === 0 ? <p className="mt-2 text-sm text-muted">{v.noActivity}</p> : (
          <ul className="mt-2 space-y-1.5 text-sm">
            {o.activity.map((a, i) => <li key={i} className="break-words"><span className="font-medium">{a.who}</span> {a.kind === "enrolled" ? v.enrolledAct : v.removedAct} {a.event} <span className="text-xs text-muted">· {fmtDate(a.at.slice(0, 10), lang)}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
