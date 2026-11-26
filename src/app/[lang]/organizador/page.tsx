import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { arenaKey, collectArenas, parseArenaParam } from "@/lib/arena";
import { StripeConnectButton } from "@/components/StripeConnectButton";
import { STRIPE_ENABLED } from "@/lib/flags";
import { listOrganizerEvents } from "@/lib/data/events";
import { getOrganizerOverview } from "@/lib/data/overview";
import { OrgEvents } from "@/components/OrgEvents";
import { OrgSeries } from "@/components/OrgSeries";
import { listOrganizerSeries } from "@/lib/data/series";
import { statusByDate } from "@/lib/event-time";
import { ORG_PAGE_SIZE, ORG_TABS, groupOrgEvents, parseShown, pickOrgTab } from "@/lib/org-panel";
import { listPaymentTotals } from "@/lib/data/payments";
import { listWaitlistCounts } from "@/lib/data/registrations";
import { fmtDate } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Session } from "@/lib/session";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

async function Panel({ s, lang, t, welcome, deleted, seriesDeleted, verified, arena, passwordChanged, asked, shownCount }: { s: Session; lang: Lang; t: Dict; welcome: boolean; deleted: boolean; seriesDeleted: boolean; verified: boolean; arena: string; passwordChanged: boolean; asked: string; shownCount: number }) {
  // Un organizador sin verificar no puede operar (la base lo rechaza): no hay resumen que mostrar, solo su aviso de revisión.
  const events = listOrganizerEvents(s.id);
  const [mine, overview, totals, waitlist, series] = await Promise.all([
    events, s.verified ? getOrganizerOverview() : Promise.resolve(null), listPaymentTotals(s.id).catch(() => null), listWaitlistCounts().catch(() => null), listOrganizerSeries(s.id, events).catch(() => null),
  ]);
  const o = t.org.panel;
  // KIN-751: filtro por arena (?arena=<llave>); las opciones salen de todos sus eventos.
  const arenaOptions = collectArenas(mine.map((e) => e.venue));
  const inArena = arena ? mine.filter((e) => arenaKey(e.venue) === arena) : mine;
  // Una serie entra en el filtro si alguno de sus eventos es de esa arena.
  const seriesInArena = (series ?? []).filter((x) => !arena || x.events.some((e) => arenaKey(e.venue) === arena));
  // KIN-763: pestañas según el estado (la fecha pasada cuenta como finalizado, KIN-656) y una para las series.
  const groups = groupOrgEvents(inArena.map((e) => ({ ...e, status: statusByDate(e) })));
  const counts = { ...groups, series: seriesInArena };
  const tab = pickOrgTab(asked, counts);
  const list = tab === "series" ? [] : groups[tab];
  const total = counts[tab].length;
  const href = (extra: Record<string, string>) => `/${lang}/organizador?${new URLSearchParams({ ...(arena ? { arena } : {}), ver: tab, ...extra })}`;
  const bySlug = new Map((totals ?? []).map((x) => [x.slug, x]));
  const noResults = new Set(overview?.todo.no_results.map((x) => x.slug));
  const noOpening = new Set(overview?.todo.no_opening.map((x) => x.slug));
  const info = (e: (typeof list)[number]) => ({
    paid: bySlug.get(e.id)?.paidCount ?? 0, pending: bySlug.get(e.id)?.pendingCount ?? 0, waiting: (e.uuid && waitlist?.[e.uuid]) || 0,
    notes: [...(noResults.has(e.id) ? [t.org.overview.noResults] : []), ...(noOpening.has(e.id) ? [t.org.overview.noOpening] : [])],
  });
  const notice = "mb-4 rounded-2xl bg-brand-soft p-4 text-sm font-medium";
  const arenaName = arenaOptions.find((a) => a.key === arena)?.name ?? t.org.arenas.filter.all;
  return (
    <>
      <div className="page">
        {verified && <p role="status" className={notice}>{t.account.alreadyVerified}</p>}
        {passwordChanged && <p role="status" className={notice}>{t.recovery.changed}</p>}
        {deleted && <p role="status" className={notice}>{t.org.del.deleted}</p>}
        {seriesDeleted && <p role="status" className={notice}>{t.org.series.deleted}</p>}
        {welcome && s.verified && <p role="status" className={notice}>{t.org.welcome}</p>}
        {!s.verified && (
          <div role="note" className="mb-4 rounded-2xl border border-line bg-sand p-4 text-sm">
            <p className="font-semibold">{s.license === "expired" ? t.org.license.expiredTitle : t.org.license.noneTitle}</p>
            <p className="mt-1 text-muted">{s.license === "expired" ? `${t.org.license.expiredText} ${s.licenseUntil ? fmtDate(s.licenseUntil.slice(0, 10), lang) : ""}` : t.org.license.noneText}</p>
          </div>
        )}

        {/* Con aire (KIN-763): saludo y botones de crear; el filtro de arena va junto a «Mis eventos» y lo que falta cobrar se ve en Pagos. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted">{o.hello}</p>
            <h1 className="break-words text-xl font-semibold leading-tight sm:text-3xl">{s.name}</h1>
            {arenaOptions.length === 1 && <p className="mt-1 text-sm text-muted">{arenaOptions[0].name}</p>}
          </div>
          {s.verified ? (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <Link href={`/${lang}/organizador/eventos/nuevo`} data-testid="new-individual-event" className="rounded-full bg-sand px-4 py-3 text-center text-sm font-medium hover:bg-line">{t.org.newEvent}</Link>
              <Link href={`/${lang}/organizador/series/nueva`} className="rounded-full bg-brand px-4 py-3 text-center text-sm font-medium text-white hover:bg-brand-hot">{t.org.newSeries}</Link>
            </div>
          ) : <p className="self-start rounded-full bg-sand px-5 py-2.5 text-sm font-medium text-muted">{t.org.newEvent}</p>}
        </div>
        {s.verified && !overview && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t.org.overview.loadError}</p>}
        {STRIPE_ENABLED && <StripeConnectButton lang={lang} {...t.org.stripe} />}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 id="mis-eventos" className="scroll-mt-24 text-xl font-semibold">{t.org.myEvents}</h2>
          {arenaOptions.length > 1 && (
            <details key={arena} className="relative" data-testid="arena-filter">
              <summary aria-label={`${t.org.arenas.filter.label}: ${arenaName}`} className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full border border-line bg-white pl-4 pr-3 text-sm font-medium hover:border-ink [&::-webkit-details-marker]:hidden">
                <span className="max-w-40 truncate">{arenaName}</span>
                <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 5 5 5-5" /></svg>
              </summary>
              <nav aria-label={t.org.arenas.filter.label} className="absolute right-0 top-12 z-20 max-h-72 w-60 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(20,19,17,0.25)]">
                {[{ key: "", name: t.org.arenas.filter.all }, ...arenaOptions].map((a) => (
                  <Link key={a.key} href={`/${lang}/organizador?${new URLSearchParams({ ...(a.key ? { arena: a.key } : {}), ...(asked ? { ver: asked } : {}) })}`} scroll={false} aria-current={arena === a.key ? "page" : undefined}
                    className={`block rounded-xl px-3 py-2.5 text-sm hover:bg-sand ${arena === a.key ? "bg-sand font-medium" : ""}`}>{a.name}</Link>
                ))}
              </nav>
            </details>
          )}
        </div>
        {/* El número va arriba y grande, con su nombre debajo: junto al texto no se entendía qué contaba. */}
        <nav aria-label={t.org.myEvents} className="mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-sand p-1">
          {ORG_TABS.map((id) => (
            <Link key={id} href={href({ ver: id })} scroll={false} aria-current={tab === id ? "page" : undefined}
              className={`flex flex-col items-center rounded-xl px-1 py-2 transition ${tab === id ? "bg-white shadow-[0_1px_3px_rgba(20,19,17,0.12)]" : "text-muted hover:text-ink"}`}>
              <span className={`text-lg font-semibold tabular-nums leading-tight ${tab === id ? "text-brand-hot" : ""}`}>{counts[id].length}</span>
              <span className={`text-xs sm:text-sm ${tab === id ? "font-medium text-ink" : ""}`}>{o.tabs[id]}</span>
            </Link>
          ))}
        </nav>
        {tab === "series" ? (
          series === null ? <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t.org.overview.loadError}</p>
            : total === 0 ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{series.length === 0 ? t.org.series.none : t.org.arenas.filter.empty}</p>
              : <OrgSeries items={seriesInArena.slice(0, shownCount)} lang={lang} t={t} />
        ) : list.length === 0
          ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{mine.length === 0 ? t.org.noEvents : inArena.length === 0 ? t.org.arenas.filter.empty : o.tabEmpty}</p>
          : <OrgEvents events={list.slice(0, shownCount)} info={info} lang={lang} t={t} />}
        {total > shownCount && (
          <div className="mt-4 text-center"><Link href={href({ n: String(shownCount + ORG_PAGE_SIZE) })} scroll={false} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:border-ink">{t.people.loadMore}</Link></div>
        )}

        {/* La actividad reciente sigue aquí, plegada, hasta que tenga su propia pantalla (KIN-747). */}
        {overview && overview.activity.length > 0 && (
          <details className="card mt-8 p-4">
            <summary className="cursor-pointer py-2.5 text-sm font-medium">{t.org.overview.activity}</summary>
            <ul className="mt-2 space-y-1.5 text-sm">
              {overview.activity.map((a, i) => <li key={i} className="break-words"><span className="font-medium">{a.who}</span> {a.kind === "enrolled" ? t.org.overview.enrolledAct : t.org.overview.removedAct} {a.event} <span className="text-xs text-muted">· {fmtDate(a.at.slice(0, 10), lang)}</span></li>)}
            </ul>
          </details>
        )}
        {/* La app de escritorio (KIN-761): se usa poco, por eso va como enlace al final. La página vuelve a comprobar el permiso. */}
        <Link href={`/${lang}/organizador/app`} className="mt-6 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-ink">{t.nav.localApp}<span aria-hidden>›</span></Link>
        {s.verified && s.license === "valid" && s.licenseUntil && <p className="mt-1 text-xs text-muted">{t.org.license.validUntil} {fmtDate(s.licenseUntil.slice(0, 10), lang)}</p>}
      </div>
    </>
  );
}

async function Page({ props }: { props: PageProps<"/[lang]/organizador"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const sp = await props.searchParams;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador`}>
      {(s) => <Panel s={s} lang={lang} t={t} welcome={sp.bienvenido === "1"} deleted={sp.borrado === "1"} seriesDeleted={sp.serieBorrada === "1"} verified={sp.yaVerificada === "1"} passwordChanged={sp.contrasena === "1"} arena={parseArenaParam(sp.arena)} asked={typeof sp.ver === "string" ? sp.ver : ""} shownCount={parseShown(sp.n)} />}
    </Gate>
  );
}

export default function PanelPage(props: PageProps<"/[lang]/organizador">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
