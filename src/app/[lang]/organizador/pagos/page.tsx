import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { listArenas } from "@/lib/data/arenas";
import { listPaymentRows, listPaymentTotals, PAYMENT_ROWS_LIMIT, type PaymentRow } from "@/lib/data/payments";
import { arenaKey } from "@/lib/arena";
import { parsePaymentFilters, paymentFiltersQuery, type PaymentFilters } from "@/lib/payment-filters";
import { setRegistrationPayment } from "@/lib/payment-actions";
import { fmtDate, mxn, type Lang } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Dict } from "@/dictionaries/es";

// Gestión general de pagos del organizador (KIN-754): qué eventos tiene, cuánto se espera, cuánto se pagó y quién debe.
// Solo pagado y pendiente. Marcar un pago aquí cambia la misma inscripción que ve el evento y la app (no hay otra copia).
// Filtro por arena (KIN-765, ?arena=<llave>): acota los totales, la tabla de eventos y la lista a los eventos de esa arena. Una llave que no es de
// ninguna arena del organizador se ignora (se ve todo), y con menos de dos arenas el selector no aparece.

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

function PayForm({ lang, row, query, method, label, tone }: { lang: Lang; row: PaymentRow; query: string; method: string; label: string; tone: "solid" | "ghost" }) {
  return (
    <form action={setRegistrationPayment}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={row.eventSlug} /><input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="method" value={method} /><input type="hidden" name="from" value="pagos" /><input type="hidden" name="query" value={query} />
      <button className={tone === "solid" ? "rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-brand-hot" : "rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-ink hover:text-ink"}>{label}</button>
    </form>
  );
}

async function Content({ organizerId, lang, t, f, pagoError }: { organizerId: string; lang: Lang; t: Dict; f: PaymentFilters; pagoError: boolean }) {
  const p = t.org.pays;
  let totals, list, arenas;
  try {
    arenas = await listArenas();
    const arenaId = f.arena ? arenas.find((a) => arenaKey(a.name) === f.arena)?.id ?? null : null;
    [totals, list] = await Promise.all([listPaymentTotals(organizerId, arenaId), listPaymentRows(organizerId, f, arenaId)]);
  } catch { return <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{p.loadError}</p>; }
  const sum = totals.reduce((a, x) => ({ expected: a.expected + x.expectedCents, paid: a.paid + x.paidCents, pending: a.pending + x.pendingCents }), { expected: 0, paid: 0, pending: 0 });
  const query = paymentFiltersQuery(f);
  const arenaOptions = arenas.map((a) => ({ key: arenaKey(a.name), name: a.name, count: a.events })).filter((o) => o.key);
  const arenaSelected = arenaOptions.some((o) => o.key === f.arena) ? f.arena : "";
  const showArena = arenaOptions.length > 1 || Boolean(arenaSelected);
  const filtered = Boolean(f.event || f.q || f.status !== "pendiente" || arenaSelected);
  const link = (slug: string) => `/${lang}/organizador/pagos?evento=${encodeURIComponent(slug)}&estado=pendiente${arenaSelected ? `&arena=${encodeURIComponent(arenaSelected)}` : ""}`;
  return (
    <>
      {pagoError && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t.pay.error}</p>}
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><dd className="text-3xl font-semibold tabular-nums" data-testid="pays-expected">{mxn(sum.expected / 100, lang)}</dd><dt className="label mt-1">{p.expected}</dt></div>
        <div className="card p-4"><dd className="text-3xl font-semibold tabular-nums text-emerald-700" data-testid="pays-paid">{mxn(sum.paid / 100, lang)}</dd><dt className="label mt-1">{p.collected}</dt></div>
        <div className="card p-4"><dd className="text-3xl font-semibold tabular-nums text-brand-hot" data-testid="pays-pending">{mxn(sum.pending / 100, lang)}</dd><dt className="label mt-1">{p.pending}</dt></div>
      </dl>

      <h2 className="mt-10 text-xl font-semibold">{p.events}</h2>
      {totals.length === 0 ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{p.noEvents}</p> : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="pays-events">
            <thead className="bg-sand label"><tr><th className="p-3">{t.org.tbl.event}</th><th>{p.expected}</th><th>{p.collected}</th><th>{p.pending}</th><th></th></tr></thead>
            <tbody>
              {totals.map((e) => (
                <tr key={e.slug} className={`border-t border-line ${f.event === e.slug ? "bg-brand-soft/40" : ""}`}>
                  <td className="p-3 font-medium">{e.name}<span className="block text-xs font-normal text-muted">{e.date ? fmtDate(e.date, lang) : "–"} · {e.paidCount + e.pendingCount} {p.registered}</span></td>
                  <td className="tabular-nums">{mxn(e.expectedCents / 100, lang)}</td>
                  <td className="tabular-nums text-emerald-700">{mxn(e.paidCents / 100, lang)} <span className="text-xs text-muted">({e.paidCount})</span></td>
                  <td className="tabular-nums font-medium text-brand-hot">{mxn(e.pendingCents / 100, lang)} <span className="text-xs font-normal text-muted">({e.pendingCount})</span></td>
                  <td className="pr-3 text-right"><Link href={link(e.slug)} className="whitespace-nowrap text-sm font-medium text-brand-hot hover:underline">{p.open} →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 id="lista" className="mt-10 scroll-mt-24 text-xl font-semibold">{p.listTitle}</h2>
      <form method="get" className={`card mt-3 grid gap-3 p-4 sm:items-end ${showArena ? "sm:grid-cols-[1fr_1fr_11rem_1fr_auto]" : "sm:grid-cols-[1fr_11rem_1fr_auto]"}`} role="search" aria-label={p.filters}>
        {showArena && (
          <label className="block text-sm font-medium">{p.arena}
            <select name="arena" defaultValue={arenaSelected} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" data-testid="pays-arena">
              <option value="">{p.allArenas}</option>
              {arenaOptions.map((o) => <option key={o.key} value={o.key}>{o.name} ({o.count})</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">{p.event}
          <select name="evento" defaultValue={f.event ?? ""} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink">
            <option value="">{p.allEvents}</option>
            {totals.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">{p.status}
          <select name="estado" defaultValue={f.status} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink">
            <option value="pendiente">{p.statusPending}</option><option value="pagado">{p.statusPaid}</option><option value="todos">{p.statusAll}</option>
          </select>
        </label>
        <label className="block text-sm font-medium">{p.search}
          <input name="q" type="search" maxLength={80} defaultValue={f.q} className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink" />
        </label>
        <div className="flex items-center gap-3">
          <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{p.apply}</button>
          {filtered && <Link href={`/${lang}/organizador/pagos#lista`} className="text-sm text-muted hover:text-ink">{p.clear}</Link>}
        </div>
      </form>

      {list.rows.length === 0 ? <p className="mt-4 rounded-2xl bg-sand p-6 text-center text-muted" data-testid="pays-empty">{p.empty}</p> : (
        <>
          <p className="mt-4 text-sm text-muted" data-testid="pays-count">{p.showing} <span className="tabular-nums">{list.rows.length}</span> {p.of} <span className="tabular-nums">{list.total}</span>{list.total > PAYMENT_ROWS_LIMIT && <> · {p.refine}</>}</p>
          <div className="card mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="pays-rows">
              <thead className="bg-sand label"><tr><th className="p-3">{p.person}</th><th>{p.eventCol}</th><th>{p.category}</th><th>{p.amount}</th><th>{p.status}</th><th>{p.since}</th><th>{p.action}</th></tr></thead>
              <tbody>
                {list.rows.map((r) => {
                  const paid = r.status === "pagado";
                  return (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="p-3 font-medium">{r.name}{r.role && <span className="block text-xs font-normal text-muted">{r.role === "header" ? t.roles.header : r.role === "heeler" ? t.roles.heeler : r.role}</span>}</td>
                      <td>{r.eventName}</td>
                      <td>{r.category}</td>
                      <td className="tabular-nums">{mxn(r.amountCents / 100, lang)}</td>
                      <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${paid ? "bg-brand-soft text-brand-hot" : "bg-sand text-muted"}`}>{paid ? p.paidState : p.pendingState}</span>{paid && r.method && <span className="block text-xs text-muted">{t.pay.method[r.method as "efectivo" | "transferencia" | "stripe"] ?? r.method}</span>}</td>
                      <td className="tabular-nums">{paid && r.paidAt ? <>{p.paidOn} {fmtDate(r.paidAt.slice(0, 10), lang)}</> : fmtDate(r.createdAt.slice(0, 10), lang)}</td>
                      <td className="pr-3">
                        {paid ? (r.method !== "stripe" && <PayForm lang={lang} row={r} query={query} method="pendiente" label={t.pay.undo} tone="ghost" />) : (
                          <div className="flex flex-wrap gap-2">
                            <PayForm lang={lang} row={r} query={query} method="efectivo" label={t.pay.method.efectivo} tone="solid" />
                            <PayForm lang={lang} row={r} query={query} method="transferencia" label={t.pay.method.transferencia} tone="solid" />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/pagos`}>
      {(s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
              <h1 className="text-3xl font-semibold">{t.org.pays.title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted">{t.org.pays.blurb}</p>
              <Content organizerId={s.id} lang={lang} t={t} f={f} pagoError={one(sp.pagoError) === "1"} />
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
