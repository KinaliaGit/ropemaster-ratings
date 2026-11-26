import { BackLink } from "@/components/BackLink";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { CopyLink } from "@/components/CopyLink";
import { PhaseBadge } from "@/components/PhaseBadge";
import { SeriesEventsForm } from "@/components/SeriesEventsForm";
import { getOrganizerSeries } from "@/lib/data/series";
import { deleteSeries, deleteSeriesEvent, publishSeriesDrafts } from "@/lib/series-actions";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { eventPhase, fmtDeadline } from "@/lib/event-time";
import { fmtDate } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Session } from "@/lib/session";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

type Flags = { nueva: boolean; editada: boolean; agregados: number; borrado: boolean; publicados: boolean; incompletos: number; error: string | null; borrarError: string | null };

async function Manage({ s, id, lang, t, flags, shareUrl }: { s: Session; id: string; lang: Lang; t: Dict; flags: Flags; shareUrl: string }) {
  // Un organizador solo gestiona sus propias series (la base además lo impone).
  const found = await getOrganizerSeries(s.id, id);
  if (!found) notFound();
  const { series: x, template, events } = found;
  const m = t.org.series, ev = m.ev;
  const phases = events.map((e) => eventPhase({ status: e.status, enrolled: e.enrolled, capacity: e.capacity, opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed }));
  const drafts = phases.filter((p) => p === "draft").length;
  const anyPublic = events.some((e) => e.status !== "borrador");
  const errorMsg = flags.error ? (ev.errors as Record<string, string>)[flags.error] ?? ev.errors.failed : null;
  // Los errores de borrado (del_*) se muestran arriba, junto a la lista; los de agregar, dentro del formulario.
  const delError = flags.error?.startsWith("del_") ? errorMsg : null;
  const addError = flags.error && !flags.error.startsWith("del_") ? errorMsg : null;
  return (
    <>
      <div className="page">
        <BackLink href={`/${lang}/organizador?ver=series`}>{m.back}</BackLink>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">{x.name}</h1>
            <p className="text-muted">{fmtDate(x.startDate, lang)} – {fmtDate(x.endDate, lang)}</p>
            {x.description && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm">{x.description}</p>}
          </div>
          <div className="flex gap-2">
            {anyPublic && <Link href={`/${lang}/series/${x.id}`} className="rounded-full bg-sand px-4 py-2 text-sm font-medium hover:bg-line">{m.publicPage}</Link>}
            <Link href={`/${lang}/organizador/series/${x.id}/editar`} className="rounded-full bg-sand px-4 py-2 text-sm font-medium hover:bg-line">{m.edit}</Link>
          </div>
        </div>
        {flags.nueva && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{m.created}</p>}
        {flags.editada && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{m.saved}</p>}
        {flags.agregados > 0 && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{ev.msg.agregados} {flags.agregados} {ev.msg.agregadosEnd}</p>}
        {flags.borrado && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{ev.msg.borrado}</p>}
        {flags.publicados && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{ev.msg.publicados}</p>}
        {flags.incompletos > 0 && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{flags.incompletos} {ev.msg.incompletos}</p>}
        {!template.city.trim() && <p role="status" data-testid="empty-template" className="mt-6 rounded-2xl bg-sand p-4 text-sm">{m.emptyTemplate} <Link href={`/${lang}/organizador/series/${x.id}/editar`} className="font-medium underline">{m.edit} →</Link></p>}
        {delError && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{delError}</p>}

        <section aria-labelledby="share" className="card mt-6 p-5">
          <h2 id="share" className="text-base font-semibold">{t.org.share.title}</h2>
          <p className="mt-0.5 text-sm text-muted">{anyPublic ? m.shareHint : m.noPublic}</p>
          <CopyLink url={shareUrl} copy={t.org.share.copy} copied={t.org.share.copied} whatsappLabel={t.org.share.whatsapp} whatsappText={t.org.share.whatsappText} />
        </section>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3" id="eventos">
          <h2 className="text-xl font-semibold">{ev.title} <span className="text-base font-normal tabular-nums text-muted">({events.length}/30)</span></h2>
          <div className="flex flex-wrap items-center gap-2">
            {events.length < 30 && <a href="#agregar" className="rounded-full bg-sand px-4 py-2 text-sm font-medium hover:bg-line" data-testid="series-new-event">{ev.newEvent}</a>}
            {drafts > 0 && (
              <form action={publishSeriesDrafts}>
                <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={x.id} />
                <button className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hot">{ev.publishDrafts} ({drafts})</button>
              </form>
            )}
          </div>
        </div>
        {events.length === 0 ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{ev.none}</p> : (
          <ul className="mt-3 space-y-3">
            {events.map((e, i) => (
              <li key={e.uuid} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm tabular-nums text-muted">{e.date ? fmtDate(e.date, lang) : "–"}</p>
                    <p className="font-semibold leading-snug">{e.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      {ev.enrolled} <span className="tabular-nums">{e.enrolled}/{e.capacity}</span>
                      {" · "}{e.registrationOpensAt ? `${ev.opensOn} ${fmtDeadline(e.registrationOpensAt, e.timezone, lang)}` : ev.opensNow}
                      {e.registrationClosesAt && <>{" · "}{ev.closesOn} {fmtDeadline(e.registrationClosesAt, e.timezone, lang)}</>}
                    </p>
                  </div>
                  <PhaseBadge phase={phases[i]} label={t.series.phase[phases[i]]} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/${lang}/organizador/eventos/${e.id}`} className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hot">{ev.manage}</Link>
                  {e.status !== "finalizado" && <Link href={`/${lang}/organizador/eventos/${e.id}/editar`} className="rounded-full bg-sand px-3 py-1.5 text-xs font-medium hover:bg-line">{ev.edit}</Link>}
                  {e.status !== "finalizado" && e.enrolled === 0 && (
                    <details className="ml-auto">
                      <summary className="cursor-pointer list-none rounded-full px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">{ev.delete}</summary>
                      <form action={deleteSeriesEvent} className="mt-2 rounded-xl bg-red-50 p-3 text-sm">
                        <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={x.id} /><input type="hidden" name="id" value={e.uuid} />
                        <p className="font-medium text-red-900">{ev.deleteTitle}</p>
                        <p className="mt-1 text-red-900">{ev.deleteText}</p>
                        <button className="mt-2 rounded-full bg-red-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-800">{ev.deleteConfirm}</button>
                      </form>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div id="agregar" className="mt-10 scroll-mt-24">
          {events.length < 30 && (
            <SeriesEventsForm
              lang={lang} slug={x.id} seriesName={x.name} startDate={x.startDate} endDate={x.endDate} existing={events.length} error={addError ?? undefined}
              labels={{ addTitle: ev.addTitle, addHint: ev.addHint, name: ev.name, date: ev.date, opens: ev.opens, opensHint: ev.opensHint, addRow: ev.addRow, removeRow: ev.removeRow, createDraft: ev.createDraft, createPublish: ev.createPublish, range: ev.range, defaultName: ev.defaultName }}
            />
          )}
        </div>

        <section aria-labelledby="danger" className="mt-14 max-w-xl rounded-2xl border border-red-200 p-5">
          <h2 id="danger" className="text-lg font-semibold text-red-800">{t.org.del.zone}</h2>
          <p className="mt-1 text-sm text-muted">{t.org.del.seriesText}</p>
          {flags.borrarError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(t.org.del.errors as Record<string, string>)[flags.borrarError] ?? t.org.del.errors.failed}</p>}
          <div className="mt-4">
            {events.length > 0 ? (
              <p className="text-sm">{t.org.del.seriesHasEvents} <a href="#eventos" className="font-medium text-brand-hot hover:underline">{t.org.del.goToEvents} →</a></p>
            ) : (
              <DeleteConfirmDialog
                action={deleteSeries} lang={lang} id={x.id} fields={{ slug: x.id }} needReason={false}
                summary={[[t.org.del.name, x.name], [t.org.del.date, `${fmtDate(x.startDate, lang)} – ${fmtDate(x.endDate, lang)}`]]}
                l={{ button: t.org.del.seriesButton, title: t.org.del.seriesTitle, typePrompt: t.org.del.typePrompt(t.org.del.word), word: t.org.del.word, reasonLabel: "", reasonPlaceholder: "", minChars: "", notify: null, cancel: t.org.del.cancel, confirm: t.org.del.confirm }}
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

async function Resolver({ props }: { props: PageProps<"/[lang]/organizador/series/[id]"> }) {
  const lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const flags: Flags = {
    nueva: sp.nueva === "1", editada: sp.editada === "1", agregados: Math.max(0, Math.floor(Number(sp.agregados)) || 0),
    borrado: sp.borrado === "1", publicados: sp.publicados === "1", incompletos: Math.max(0, Math.floor(Number(sp.incompletos)) || 0), error: typeof sp.error === "string" ? sp.error : null, borrarError: typeof sp.borrarError === "string" ? sp.borrarError : null,
  };
  // Enlace sin idioma: cada persona que lo abra llega a su idioma (el proxy elige es/en por su navegador).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${proto}://${host}/series/${id}`;
  const t = getDictionary(lang);
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/series/${id}`}>
      {(s) => <Manage s={s} id={id} lang={lang} t={t} flags={flags} shareUrl={shareUrl} />}
    </Gate>
  );
}

export default function GestionarSerie(props: PageProps<"/[lang]/organizador/series/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><Resolver props={props} /></Suspense>;
}
