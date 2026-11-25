import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { getArena, listArenas } from "@/lib/data/arenas";
import { deleteArena, mergeArenas, updateArena } from "@/lib/arena-actions";
import { fmtDate } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Una arena con su historial de eventos y series, sus datos y las acciones de unir y borrar (KIN-751).
async function Page({ props }: { props: PageProps<"/[lang]/organizador/arenas/[id]"> }) {
  const lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const a = t.org.arenas;
  const error = typeof sp.error === "string" ? sp.error : null;
  const stateLabel: Record<string, string> = { publicado: t.status.published, borrador: t.status.draft, finalizado: t.status.finished };
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/arenas/${id}`}>
      {async (s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        if (!UUID.test(id)) notFound();
        const [arena, all] = await Promise.all([getArena(id), listArenas()]);
        if (!arena) notFound();
        const others = all.filter((x) => x.id !== arena.id);
        const inUse = arena.events.length > 0 || arena.series.length > 0;
        return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-4xl px-5 pb-10 pt-8">
              <Link href={`/${lang}/organizador/arenas`} className="text-sm text-muted hover:text-ink">← {a.back}</Link>
              <h1 className="mt-2 text-3xl font-semibold">{arena.name}</h1>
              {arena.city && <p className="mt-1 text-sm text-muted">{arena.city}</p>}
              {(sp.guardada === "1" || sp.unida === "1") && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{sp.unida === "1" ? a.merged : a.saved}</p>}
              {error && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{(a.errors as Record<string, string>)[error] ?? a.errors.failed}</p>}

              <h2 className="mt-8 text-xl font-semibold">{a.historyEvents} <span className="text-base font-normal tabular-nums text-muted">({arena.events.length})</span></h2>
              {arena.events.length === 0 ? <p className="mt-3 rounded-2xl bg-sand p-5 text-center text-muted">{a.noEvents}</p> : (
                <ul className="card mt-3 divide-y divide-line" data-testid="arena-events">
                  {arena.events.map((e) => (
                    <li key={e.slug}>
                      <Link href={`/${lang}/organizador/eventos/${e.slug}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-sand/60">
                        <span className="min-w-0 break-words font-medium">{e.name}{e.seriesName && <span className="block text-xs font-normal text-muted">{e.seriesName}</span>}</span>
                        <span className="text-right tabular-nums text-muted">{e.date ? fmtDate(e.date, lang) : "–"} · {stateLabel[e.status] ?? e.status}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="mt-8 text-xl font-semibold">{a.historySeries} <span className="text-base font-normal tabular-nums text-muted">({arena.series.length})</span></h2>
              {arena.series.length === 0 ? <p className="mt-3 rounded-2xl bg-sand p-5 text-center text-muted">{a.noSeries}</p> : (
                <ul className="card mt-3 divide-y divide-line" data-testid="arena-series">
                  {arena.series.map((x) => (
                    <li key={x.slug}>
                      <Link href={`/${lang}/organizador/series/${x.slug}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-sand/60">
                        <span className="font-medium">{x.name}</span>
                        <span className="tabular-nums text-muted">{fmtDate(x.startDate, lang)} – {fmtDate(x.endDate, lang)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="mt-10 text-xl font-semibold">{a.editTitle}</h2>
              <form action={updateArena} className="card mt-3 space-y-4 p-5">
                <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={arena.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">{a.name}<input required name="name" maxLength={120} defaultValue={arena.name} className={input} /></label>
                  <label className="block text-sm font-medium">{a.city}<input name="city" maxLength={80} defaultValue={arena.city} className={input} /></label>
                </div>
                <label className="block text-sm font-medium">{a.notes}<textarea name="notes" rows={2} maxLength={500} defaultValue={arena.notes} className={input} /></label>
                <p className="text-xs text-muted">{a.renameNote}</p>
                <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{a.save}</button>
              </form>

              <h2 className="mt-10 text-xl font-semibold">{a.mergeTitle}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">{a.mergeHint}</p>
              {others.length === 0 ? <p className="mt-3 text-sm text-muted">{a.mergeNone}</p> : (
                <form action={mergeArenas} className="card mt-3 flex flex-wrap items-end gap-3 p-5">
                  <input type="hidden" name="lang" value={lang} /><input type="hidden" name="drop" value={arena.id} />
                  <label className="block min-w-[14rem] flex-1 text-sm font-medium">{a.mergeInto}
                    <select required name="keep" defaultValue="" className={input}>
                      <option value="" disabled>—</option>
                      {others.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` · ${x.city}` : ""}</option>)}
                    </select>
                  </label>
                  <button className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{a.mergeBtn}</button>
                </form>
              )}

              <h2 className="mt-10 text-xl font-semibold">{a.deleteTitle}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">{inUse ? a.deleteBlocked : a.deleteHint}</p>
              {!inUse && (
                <form action={deleteArena} className="mt-3">
                  <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={arena.id} />
                  <button className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-red-800 hover:border-red-800">{a.deleteBtn}</button>
                </form>
              )}
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function ArenaOrg(props: PageProps<"/[lang]/organizador/arenas/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
