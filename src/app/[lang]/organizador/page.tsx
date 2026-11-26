import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { arenaKey, collectArenas, parseArenaParam } from "@/lib/arena";
import { StripeConnectButton } from "@/components/StripeConnectButton";
import { STRIPE_ENABLED } from "@/lib/flags";
import { listOrganizerEvents } from "@/lib/data/events";
import { getOrganizerOverview } from "@/lib/data/overview";
import { OrgEvents } from "@/components/OrgEvents";
import { statusByDate } from "@/lib/event-time";
import { ORG_PAGE_SIZE, ORG_TABS, groupOrgEvents, parseShown, pickOrgTab } from "@/lib/org-panel";
import { listPaymentTotals } from "@/lib/data/payments";
import { listWaitlistCounts } from "@/lib/data/registrations";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Session } from "@/lib/session";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

async function Panel({ s, lang, t, welcome, deleted, verified, arena, passwordChanged, asked, shownCount }: { s: Session; lang: Lang; t: Dict; welcome: boolean; deleted: boolean; verified: boolean; arena: string; passwordChanged: boolean; asked: string; shownCount: number }) {
  // Un organizador sin verificar no puede operar (la base lo rechaza): no hay resumen que mostrar, solo su aviso de revisión.
  const [mine, overview, totals, waitlist] = await Promise.all([
    listOrganizerEvents(s.id), s.verified ? getOrganizerOverview() : Promise.resolve(null), listPaymentTotals(s.id).catch(() => null), listWaitlistCounts().catch(() => null),
  ]);
  const o = t.org.panel;
  // KIN-751: filtro por arena (?arena=<llave>); las opciones salen de todos sus eventos.
  const arenaOptions = collectArenas(mine.map((e) => e.venue));
  const inArena = arena ? mine.filter((e) => arenaKey(e.venue) === arena) : mine;
  // KIN-763: tres pestañas según el estado (la fecha pasada cuenta como finalizado, KIN-656).
  const groups = groupOrgEvents(inArena.map((e) => ({ ...e, status: statusByDate(e) })));
  const tab = pickOrgTab(asked, groups);
  const list = groups[tab];
  const href = (extra: Record<string, string>) => `/${lang}/organizador?${new URLSearchParams({ ...(arena ? { arena } : {}), ver: tab, ...extra })}`;
  const bySlug = new Map((totals ?? []).map((x) => [x.slug, x]));
  const noResults = new Set(overview?.todo.no_results.map((x) => x.slug));
  const noOpening = new Set(overview?.todo.no_opening.map((x) => x.slug));
  const info = (e: (typeof list)[number]) => ({
    paid: bySlug.get(e.id)?.paidCount ?? 0, pending: bySlug.get(e.id)?.pendingCount ?? 0, waiting: (e.uuid && waitlist?.[e.uuid]) || 0,
    notes: [...(noResults.has(e.id) ? [t.org.overview.noResults] : []), ...(noOpening.has(e.id) ? [t.org.overview.noOpening] : [])],
  });
  const chip = (on: boolean) => `inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ${on ? "bg-ink text-white" : "bg-sand text-muted hover:text-ink"}`;
  const notice = "mb-4 rounded-2xl bg-brand-soft p-4 text-sm font-medium";
  return (
    <>
      <OrgNav lang={lang} t={t} admin={s.isAdmin} />
      <div className="mx-auto max-w-3xl px-5 pb-10 pt-6 sm:pt-8">
        {verified && <p role="status" className={notice}>{t.account.alreadyVerified}</p>}
        {passwordChanged && <p role="status" className={notice}>{t.recovery.changed}</p>}
        {deleted && <p role="status" className={notice}>{t.org.del.deleted}</p>}
        {welcome && s.verified && <p role="status" className={notice}>{t.org.welcome}</p>}
        {!s.verified && (
          <div role="note" className="mb-4 rounded-2xl border border-line bg-sand p-4 text-sm">
            <p className="font-semibold">{s.license === "expired" ? t.org.license.expiredTitle : t.org.license.noneTitle}</p>
            <p className="mt-1 text-muted">{s.license === "expired" ? `${t.org.license.expiredText} ${s.licenseUntil ? fmtDate(s.licenseUntil.slice(0, 10), lang) : ""}` : t.org.license.noneText}</p>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{o.hello}</p>
            <h1 className="break-words text-xl font-semibold leading-tight sm:text-3xl">{s.name}</h1>
            {arenaOptions.length === 1 && <p className="mt-1 text-sm text-muted">{arenaOptions[0].name}</p>}
          </div>
          {overview && overview.payments.pending_cents > 0 && (
            <Link href={`/${lang}/organizador/pagos`} className="shrink-0 py-1 text-right leading-tight">
              <span className="block text-lg font-semibold tabular-nums text-brand-hot sm:text-2xl">{mxn(overview.payments.pending_cents / 100, lang).replace(" MXN", "")}</span>
              <span className="text-xs text-muted">{o.toCollect}</span>
            </Link>
          )}
        </div>

        {arenaOptions.length > 1 && (
          <nav aria-label={t.org.arenas.filter.label} className="mt-4 flex gap-1.5 overflow-x-auto pb-1" data-testid="arena-filter">
            <Link href={`/${lang}/organizador`} aria-current={!arena ? "page" : undefined} className={chip(!arena)}>{t.org.arenas.filter.all}</Link>
            {arenaOptions.map((a) => <Link key={a.key} href={`/${lang}/organizador?arena=${encodeURIComponent(a.key)}`} scroll={false} aria-current={arena === a.key ? "page" : undefined} className={chip(arena === a.key)}>{a.name}</Link>)}
          </nav>
        )}

        {s.verified ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
            <Link href={`/${lang}/organizador/eventos/nuevo`} data-testid="new-individual-event" className="rounded-full bg-sand py-2.5 text-center text-sm font-medium hover:bg-line">{t.org.newEvent}</Link>
            <Link href={`/${lang}/organizador/series/nueva`} className="rounded-full bg-brand py-2.5 text-center text-sm font-medium text-white hover:bg-brand-hot">{t.org.newSeries}</Link>
          </div>
        ) : <p className="mt-4 inline-block rounded-full bg-sand px-5 py-2.5 text-sm font-medium text-muted">{t.org.newEvent}</p>}
        {s.verified && !overview && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t.org.overview.loadError}</p>}
        {STRIPE_ENABLED && <StripeConnectButton lang={lang} {...t.org.stripe} />}

        <h2 id="mis-eventos" className="mt-8 scroll-mt-24 text-xl font-semibold">{t.org.myEvents}</h2>
        <nav aria-label={t.org.myEvents} className="mt-3 flex rounded-full bg-sand p-1">
          {ORG_TABS.map((id) => (
            <Link key={id} href={href({ ver: id })} scroll={false} aria-current={tab === id ? "page" : undefined}
              className={`flex-1 whitespace-nowrap rounded-full px-1 py-2.5 text-center text-[13px] transition sm:text-sm ${tab === id ? "bg-white font-medium shadow-[0_1px_3px_rgba(20,19,17,0.12)]" : "text-muted hover:text-ink"}`}>{o.tabs[id]} <span className="tabular-nums">{groups[id].length}</span></Link>
          ))}
        </nav>
        {list.length === 0
          ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{mine.length === 0 ? t.org.noEvents : inArena.length === 0 ? t.org.arenas.filter.empty : o.tabEmpty}</p>
          : <OrgEvents events={list.slice(0, shownCount)} info={info} lang={lang} t={t} />}
        {list.length > shownCount && (
          <div className="mt-4 text-center"><Link href={href({ n: String(shownCount + ORG_PAGE_SIZE) })} scroll={false} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:border-ink">{t.people.loadMore}</Link></div>
        )}

        {/* La actividad reciente sigue aquí, plegada, hasta que tenga su propia pantalla (KIN-747). */}
        {overview && overview.activity.length > 0 && (
          <details className="card mt-8 p-4">
            <summary className="cursor-pointer py-1 text-sm font-medium">{t.org.overview.activity}</summary>
            <ul className="mt-2 space-y-1.5 text-sm">
              {overview.activity.map((a, i) => <li key={i} className="break-words"><span className="font-medium">{a.who}</span> {a.kind === "enrolled" ? t.org.overview.enrolledAct : t.org.overview.removedAct} {a.event} <span className="text-xs text-muted">· {fmtDate(a.at.slice(0, 10), lang)}</span></li>)}
            </ul>
          </details>
        )}
        {s.verified && s.license === "valid" && s.licenseUntil && <p className="mt-6 text-xs text-muted">{t.org.license.validUntil} {fmtDate(s.licenseUntil.slice(0, 10), lang)}</p>}
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
      {(s) => <Panel s={s} lang={lang} t={t} welcome={sp.bienvenido === "1"} deleted={sp.borrado === "1"} verified={sp.yaVerificada === "1"} passwordChanged={sp.contrasena === "1"} arena={parseArenaParam(sp.arena)} asked={typeof sp.ver === "string" ? sp.ver : ""} shownCount={parseShown(sp.n)} />}
    </Gate>
  );
}

export default function PanelPage(props: PageProps<"/[lang]/organizador">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
