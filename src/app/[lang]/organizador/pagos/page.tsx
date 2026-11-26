import { BackLink } from "@/components/BackLink";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { listPaymentRows, listPaymentTotals, PAYMENT_ROWS_LIMIT, type PaymentRow } from "@/lib/data/payments";
import { parsePaymentFilters, paymentFiltersQuery, type PaymentFilters } from "@/lib/payment-filters";
import { setRegistrationPayment } from "@/lib/payment-actions";
import { fmtDate, mxn, type Lang } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import { ORG_PAGE_SIZE, parseShown } from "@/lib/org-panel";
import { arenaKey, collectArenas, parseArenaParam } from "@/lib/arena";
import { listOrganizerEvents } from "@/lib/data/events";
import type { Dict } from "@/dictionaries/es";

// Gestión general de pagos del organizador (KIN-754): qué eventos tiene, cuánto se espera, cuánto se pagó y quién debe.
// Solo pagado y pendiente. Marcar un pago aquí cambia la misma inscripción que ve el evento y la app (no hay otra copia).

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

function PayForm({ lang, row, query, method, label, tone }: { lang: Lang; row: PaymentRow; query: string; method: string; label: string; tone: "solid" | "ghost" }) {
  return (
    <form action={setRegistrationPayment} className="flex-1">
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={row.eventSlug} /><input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="method" value={method} /><input type="hidden" name="from" value="pagos" /><input type="hidden" name="query" value={query} />
      <button className={`min-h-11 w-full whitespace-nowrap rounded-full border px-4 text-sm font-medium transition ${tone === "solid" ? "border-line hover:border-ink hover:bg-ink hover:text-white" : "border-line text-muted hover:border-ink hover:text-ink"}`}>{label}</button>
    </form>
  );
}

// Anillo de avance: la parte verde es lo cobrado y la naranja lo que falta.
function Ring({ percent, label }: { percent: number; label: string }) {
  const round = 2 * Math.PI * 44;
  return (
    <svg viewBox="0 0 104 104" className="size-28 shrink-0 sm:size-36" role="img" aria-label={`${percent}% ${label}`}>
      <circle cx="52" cy="52" r="44" fill="none" strokeWidth="12" className="stroke-brand" />
      {percent > 0 && <circle cx="52" cy="52" r="44" fill="none" strokeWidth="12" className="stroke-emerald-500" strokeDasharray={`${(round * percent) / 100} ${round}`} transform="rotate(-90 52 52)" />}
      <text x="52" y="52" textAnchor="middle" className="fill-ink text-[22px] font-semibold">{percent}%</text>
      <text x="52" y="68" textAnchor="middle" className="fill-muted text-[11px]">{label}</text>
    </svg>
  );
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

// Dos vistas, para que la lista nunca crezca sin fin: el RESUMEN (totales y un renglón por evento) y el DETALLE, de un evento o de una
// búsqueda por nombre, que es donde se ve quién debe y se marca el pago.
async function Content({ organizerId, lang, t, f, pagoError, done, shown, arena }: { organizerId: string; lang: Lang; t: Dict; f: PaymentFilters; pagoError: boolean; done: boolean; shown: number; arena: string }) {
  const p = t.org.pays;
  let totals, list;
  const detail = Boolean(f.event || f.q);
  try { [totals, list] = await Promise.all([listPaymentTotals(organizerId), detail ? listPaymentRows(organizerId, f) : Promise.resolve({ rows: [] as PaymentRow[], total: 0 })]); } catch { return <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{p.loadError}</p>; }
  // Filtro por arena (?arena=<llave>, KIN-751): solo aparece con dos o más; afecta al resumen y a la lista de eventos.
  // Las opciones salen de TODOS sus eventos (como en el panel): una arena sin cobros también cuenta para saber que tiene varias.
  const arenas = detail ? [] : collectArenas((await listOrganizerEvents(organizerId).catch(() => [])).map((e) => e.venue));
  const inArena = arena && !detail ? totals.filter((e) => arenaKey(e.venue) === arena) : totals;
  const overview = (extra: Record<string, string>) => {
    const query = new URLSearchParams({ ...(arena ? { arena } : {}), ...extra }).toString();
    return `/${lang}/organizador/pagos${query ? `?${query}` : ""}`;
  };
  const chip = (on: boolean) => `inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ${on ? "bg-ink text-white" : "bg-sand text-muted hover:text-ink"}`;
  const sum = inArena.reduce((a, x) => ({ expected: a.expected + x.expectedCents, paid: a.paid + x.paidCents, pending: a.pending + x.pendingCents, paidN: a.paidN + x.paidCount, pendingN: a.pendingN + x.pendingCount }), { expected: 0, paid: 0, pending: 0, paidN: 0, pendingN: 0 });
  // Redondeo hacia abajo: «100%» solo cuando de verdad no falta nada.
  const percent = sum.expected > 0 ? Math.floor((sum.paid / sum.expected) * 100) : 0;
  const money = (cents: number) => mxn(cents / 100, lang).replace(" MXN", "");
  const query = paymentFiltersQuery(f);
  const to = (next: Partial<PaymentFilters>) => `/${lang}/organizador/pagos?${paymentFiltersQuery({ ...f, ...next })}`;
  const selected = totals.find((e) => e.slug === f.event);
  const home = `/${lang}/organizador/pagos`;
  const alert = pagoError && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t.pay.error}</p>;
  const tabClass = (on: boolean) => `flex-1 whitespace-nowrap rounded-full px-1 py-2.5 text-center text-[13px] transition sm:text-sm ${on ? "bg-white font-medium shadow-[0_1px_3px_rgba(20,19,17,0.12)]" : "text-muted hover:text-ink"}`;
  const search = (
    <form method="get" action={home} className="mt-3 flex items-center gap-1 rounded-full border border-line bg-white p-1 focus-within:border-ink" role="search" aria-label={p.filters}>
      {detail && <input type="hidden" name="estado" value={f.status} />}{!detail && <input type="hidden" name="estado" value="todos" />}{f.event && <input type="hidden" name="evento" value={f.event} />}
      <input key={`q:${f.q}`} name="q" type="search" maxLength={80} defaultValue={f.q} placeholder={p.search} aria-label={p.search} className="min-h-10 min-w-0 flex-1 bg-transparent pl-3 text-sm outline-none" />
      <button className="min-h-10 rounded-full bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hot">{p.apply}</button>
    </form>
  );
  const bar = (paid: number, expected: number) => (
    <span aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-brand"><span className="block h-full bg-emerald-500" style={{ width: `${expected > 0 ? Math.round((paid / expected) * 100) : 0}%` }} /></span>
  );
  const status = (e: (typeof totals)[number]) => (
    <span className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-[13px]">
      <span className="tabular-nums text-muted">{p.paidOf(e.paidCount, e.paidCount + e.pendingCount)}</span>
      {e.pendingCount > 0 ? <span className="font-medium tabular-nums text-brand-hot">{p.missing(money(e.pendingCents))}</span> : <span className="font-medium text-emerald-700">{p.complete}</span>}
    </span>
  );

  if (!detail) {
    const owing = inArena.filter((e) => e.pendingCount > 0);
    const complete = inArena.filter((e) => e.pendingCount === 0).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const showDone = done || (owing.length === 0 && complete.length > 0);
    const events = showDone ? complete : owing;
    return (
      <>
        {alert}
        {(arenas.length > 1 || arena) && (
          <nav aria-label={t.org.arenas.filter.label} className="mt-4 flex gap-1.5 overflow-x-auto pb-1" data-testid="arena-filter">
            <Link href={home} scroll={false} aria-current={!arena ? "page" : undefined} className={chip(!arena)}>{t.org.arenas.filter.all}</Link>
            {arenas.map((a) => <Link key={a.key} href={`${home}?arena=${encodeURIComponent(a.key)}`} scroll={false} aria-current={arena === a.key ? "page" : undefined} className={chip(arena === a.key)}>{a.name}</Link>)}
          </nav>
        )}
        {/* Sin cobros no hay avance que dibujar: un anillo en cero parecería que todo está pendiente. */}
        {sum.expected > 0 && (
          <section className="card mt-3 flex items-center gap-5 p-5 sm:gap-8 sm:p-7">
            <Ring percent={percent} label={p.ringLabel} />
            <dl className="min-w-0 flex-1 space-y-3 sm:flex sm:flex-wrap sm:gap-x-10 sm:space-y-0">
              <div><dt className="flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className="size-2 rounded-full bg-emerald-500" />{p.collected}</dt><dd className="text-2xl font-semibold tabular-nums sm:text-3xl" data-testid="pays-paid">{money(sum.paid)}</dd></div>
              <div><dt className="flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className="size-2 rounded-full bg-brand" />{p.pending}</dt><dd className="text-2xl font-semibold tabular-nums sm:text-3xl" data-testid="pays-pending">{money(sum.pending)}</dd></div>
              <div><dt className="text-xs text-muted">{p.expected}</dt><dd className="text-2xl font-semibold tabular-nums sm:text-3xl" data-testid="pays-expected">{money(sum.expected)}</dd></div>
            </dl>
          </section>
        )}

        <h2 className="mt-8 text-xl font-semibold">{p.byEvent}</h2>
        {inArena.length === 0 ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{totals.length === 0 ? p.noEvents : p.noneInArena}</p> : (
          <>
            {search}
            <nav aria-label={p.byEvent} className="mt-2 flex rounded-full bg-sand p-1">
              <Link href={overview({})} scroll={false} aria-current={!showDone ? "page" : undefined} className={tabClass(!showDone)}>{p.owing} <span className="tabular-nums">{owing.length}</span></Link>
              <Link href={overview({ cobro: "completos" })} scroll={false} aria-current={showDone ? "page" : undefined} className={tabClass(showDone)}>{p.completeTab} <span className="tabular-nums">{complete.length}</span></Link>
            </nav>
            {events.length === 0 ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{p.noneOwing}</p> : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 [&>:only-child]:col-span-full" data-testid="pays-events">
                {events.slice(0, shown).map((e) => (
                  <li key={e.slug} className="min-w-0">
                    <Link href={to({ event: e.slug, q: "", status: e.pendingCount > 0 ? "pendiente" : "todos" })} className="card card-link block h-full p-4">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0"><span className="line-clamp-2 break-words font-medium leading-tight">{e.name}</span><span className="text-xs text-muted">{e.date ? fmtDate(e.date, lang) : "–"}</span></span>
                        <span className="shrink-0 font-semibold tabular-nums">{money(e.expectedCents)}</span>
                      </span>
                      {bar(e.paidCents, e.expectedCents)}
                      {status(e)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {events.length > shown && (
              <div className="mt-4 text-center"><Link href={overview({ ...(showDone ? { cobro: "completos" } : {}), n: String(shown + ORG_PAGE_SIZE) })} scroll={false} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:border-ink">{t.people.loadMore}</Link></div>
            )}
          </>
        )}
      </>
    );
  }

  const chips = [
    ["pendiente", p.statusPending, selected ? selected.pendingCount : null],
    ["pagado", p.statusPaid, selected ? selected.paidCount : null],
    ["todos", p.statusAll, null],
  ] as const;
  return (
    <>
      <BackLink href={home} className="mt-2">{p.allPayments}</BackLink>
      {alert}
      {selected && (
        <section className="card mt-2 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="break-words text-xl font-semibold leading-tight">{selected.name}</h2><p className="text-sm text-muted">{selected.date ? fmtDate(selected.date, lang) : "–"}</p></div>
            <p className="shrink-0 text-right leading-tight"><span className="block text-2xl font-semibold tabular-nums">{money(selected.paidCents)}</span><span className="text-xs text-muted">{p.ofTotal(money(selected.expectedCents))}</span></p>
          </div>
          {bar(selected.paidCents, selected.expectedCents)}
          {status(selected)}
          <Link href={`/${lang}/organizador/eventos/${selected.slug}`} className="mt-2 inline-block py-1.5 text-sm font-medium text-brand-hot hover:underline">{p.seeEvent} →</Link>
        </section>
      )}
      {search}
      <nav aria-label={p.status} className="mt-2 flex rounded-full bg-sand p-1">
        {chips.map(([value, label, n]) => (
          <Link key={value} href={to({ status: value })} scroll={false} aria-current={f.status === value ? "page" : undefined}
            className={tabClass(f.status === value)}>{label}{n !== null && <> <span className="tabular-nums">{n}</span></>}</Link>
        ))}
      </nav>
      {f.q && (
        <p className="mt-2 text-sm text-muted">«{f.q}»{" "}<Link href={f.event ? to({ q: "" }) : home} className="inline-block py-1.5 font-medium text-brand-hot hover:underline">{p.clear}</Link></p>
      )}

      {list.rows.length === 0 ? <p className="mt-4 rounded-2xl bg-sand p-6 text-center text-muted" data-testid="pays-empty">{p.empty}</p> : (
        <>
          <ul className="mt-3 space-y-2" data-testid="pays-rows">
            {list.rows.map((r) => {
              const paid = r.status === "pagado";
              const role = r.role === "header" ? t.roles.header : r.role === "heeler" ? t.roles.heeler : r.role;
              return (
                <li key={r.id} className="card p-3 sm:flex sm:items-center sm:gap-4 sm:p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{initialsOf(r.name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium leading-tight">{r.name}</p>
                      <p className="break-words text-[13px] text-muted">{[r.eventName, r.category, role].filter(Boolean).join(" · ")}</p>
                      <p className="text-xs text-muted">{paid && r.paidAt ? `${p.paidOn} ${fmtDate(r.paidAt.slice(0, 10), lang)}` : `${p.since} ${fmtDate(r.createdAt.slice(0, 10), lang)}`}{paid && r.method ? ` · ${t.pay.method[r.method as "efectivo" | "transferencia" | "stripe"] ?? r.method}` : ""}</p>
                    </div>
                    <p className="shrink-0 text-right"><span className={`block font-semibold tabular-nums ${paid ? "text-emerald-700" : "text-brand-hot"}`}>{money(r.amountCents)}</span><span className="text-xs text-muted">{paid ? p.paidState : p.pendingState}</span></p>
                  </div>
                  {paid
                    ? r.method !== "stripe" && <div className="mt-2 flex sm:mt-0 sm:w-32"><PayForm lang={lang} row={r} query={query} method="pendiente" label={t.pay.undo} tone="ghost" /></div>
                    : <div className="mt-3 flex gap-2 sm:mt-0 sm:w-72"><PayForm lang={lang} row={r} query={query} method="efectivo" label={t.pay.method.efectivo} tone="solid" /><PayForm lang={lang} row={r} query={query} method="transferencia" label={t.pay.method.transferencia} tone="solid" /></div>}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-muted" data-testid="pays-count">{p.showing} <span className="tabular-nums">{list.rows.length}</span> {p.of} <span className="tabular-nums">{list.total}</span>{list.total > PAYMENT_ROWS_LIMIT && <> · {p.refine}</>}</p>
        </>
      )}
    </>
  );
}

async function Page({ props }: { props: PageProps<"/[lang]/organizador/pagos"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const f = parsePaymentFilters((k) => one(sp[k]));
  const done = one(sp.cobro) === "completos";
  const shown = parseShown(sp.n);
  const arena = parseArenaParam(sp.arena);
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/pagos`}>
      {(s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        return (
          <>
            <div className="page">
              <h1 className="text-2xl font-semibold sm:text-3xl">{t.org.pays.title}</h1>
              <Content organizerId={s.id} lang={lang} t={t} f={f} pagoError={one(sp.pagoError) === "1"} done={done} shown={shown} arena={arena} />
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function PagosOrg(props: PageProps<"/[lang]/organizador/pagos">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
