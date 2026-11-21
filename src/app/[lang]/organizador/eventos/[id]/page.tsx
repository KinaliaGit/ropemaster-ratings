import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CopyLink } from "@/components/CopyLink";
import { parseMissing, type MissingField } from "@/lib/event-publish";
import { deleteEvent, setEventStatus, setRegistrationOpen } from "@/lib/event-actions";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { enrollByOrganizer, removeRegistration, setRemovalReenroll, setRemovalRefunded } from "@/lib/registration-actions";
import { RemoveRegistrationDialog } from "@/components/RemoveRegistrationDialog";
import { fmtDeadline, isNotOpenYet, isRegistrationOpen } from "@/lib/event-time";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { listEventRegistrations, listEventRemovals } from "@/lib/data/registrations";
import { setRegistrationPayment } from "@/lib/payment-actions";
import { EventPhotos } from "@/components/EventPhotos";
import { getOrganizerEvent } from "@/lib/data/events";
import { getResultsSyncInfo } from "@/lib/data/event-results";
import { EventResultsSection } from "@/components/EventResultsSection";
import { EnrolledSkeleton } from "@/components/EventSkeleton";
import { ACTIVE_DISCIPLINES, DEFAULT_DISCIPLINE, type DisciplineId } from "@/lib/disciplines";
import type { Session } from "@/lib/session";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

type ManageProps = { s: Session; id: string; lang: Lang; t: Dict; justCreated: "publicado" | "borrador" | null; justEdited: boolean; pagoError: boolean; manual: string | null; sacado: string | null; missing: MissingField[]; borrarError: string | null; shareUrl: string; stateLabel: Record<string, string> };

type Reg = Awaited<ReturnType<typeof listEventRegistrations>>[number];

// Estado del pago de una inscripción y, para el organizador, los botones para marcarla pagada (efectivo/transferencia) o deshacerla.
function PaymentCell({ r, lang, slug, t }: { r: Reg; lang: Lang; slug: string; t: Dict }) {
  const paid = r.paymentStatus === "pagado";
  return paid ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-emerald-700">{t.org.ev.paidAmount} {mxn(r.amountCents / 100, lang)} · {t.pay.method[(r.paymentMethod ?? "efectivo") as "efectivo" | "transferencia" | "stripe"]}</span>
      {r.paymentMethod !== "stripe" && <PayForm lang={lang} slug={slug} id={r.id} method="pendiente" label={t.pay.undo} tone="ghost" />}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-brand-hot">{t.org.ev.pending}</span>
      <span className="text-xs text-muted">{t.pay.markPaid}</span>
      <PayForm lang={lang} slug={slug} id={r.id} method="efectivo" label={t.pay.method.efectivo} tone="solid" />
      <PayForm lang={lang} slug={slug} id={r.id} method="transferencia" label={t.pay.method.transferencia} tone="solid" />
    </div>
  );
}

function PayForm({ lang, slug, id, method, label, tone }: { lang: Lang; slug: string; id: string; method: string; label: string; tone: "solid" | "ghost" }) {
  return (
    <form action={setRegistrationPayment}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={id} /><input type="hidden" name="method" value={method} />
      <button className={tone === "solid" ? "rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-brand-hot" : "rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-ink hover:text-ink"}>{label}</button>
    </form>
  );
}

async function Manage({ s, id, lang, t, justCreated, justEdited, pagoError, manual, sacado, missing, borrarError, shareUrl, stateLabel }: ManageProps) {
  // Un organizador solo gestiona sus propios eventos (la base además lo impone).
  const e = await getOrganizerEvent(s.id, id);
  if (!e) notFound();
  const [rows, removals] = await Promise.all([listEventRegistrations(e.uuid!), listEventRemovals(e.uuid!)]);
  const rm = t.org.ev.remove;
  const sacadoMsg = sacado ? (rm.msg as Record<string, string>)[sacado] ?? rm.msg.failed : null;
  const payLabel = (r: Reg) => (r.paymentStatus === "pagado" ? `${t.org.ev.paidAmount} ${mxn(r.amountCents / 100, lang)} · ${t.pay.method[(r.paymentMethod ?? "efectivo") as "efectivo" | "transferencia" | "stripe"]}` : t.org.ev.pending);
  const removeButton = (r: Reg) => (e.status !== "finalizado" && (
    <RemoveRegistrationDialog action={removeRegistration} lang={lang} slug={e.id} id={r.id} name={r.name} category={r.category} paymentLabel={payLabel(r)} paid={r.paymentStatus === "pagado"}
      l={{ button: rm.button, title: rm.title, person: rm.person, payment: rm.payment, reasonLabel: rm.reasonLabel, reasonPlaceholder: rm.reasonPlaceholder, presets: rm.presets, other: rm.other, presetList: rm.presetList, refundWarning: rm.refundWarning, cancel: rm.cancel, confirm: rm.confirm, minChars: rm.minChars }} />
  ));
  const sync = e.uuid ? await getResultsSyncInfo(e.uuid) : { count: 0, lastSyncAt: null, closedAt: null };
  const resultDisciplines: DisciplineId[] = ACTIVE_DISCIPLINES.filter((d) => e.disciplines.includes(d.id)).map((d) => d.id);
  if (resultDisciplines.length === 0) resultDisciplines.push(DEFAULT_DISCIPLINE);
  const regOpen = isRegistrationOpen({ opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed });
  const notYet = !e.registrationClosed && isNotOpenYet({ opensAt: e.registrationOpensAt }); // apertura programada: se abre sola, no hay nada que cerrar ni reabrir
  const manualMsg = manual ? (t.org.ev.manual as Record<string, string>)[manual] ?? t.org.ev.manual.failed : null;
  const field = "rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink";
  return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
              <Link href={`/${lang}/organizador`} className="text-sm text-muted hover:text-ink">← {t.org.ev.back}</Link>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-semibold">{e.name}</h1>
                  <p className="text-muted">{e.date ? fmtDate(e.date, lang) : "–"} · {e.venue}, {e.city}</p>
                  <p className="mt-1 text-sm text-muted" data-testid="org-draw-type">
                    {t.event.drawType}: {e.drawType === "lazada_sorteada" ? t.event.lazadaSorteada : t.event.roundRobin}
                    {e.rounds !== null && ` · ${e.rounds} ${t.event.roundsWord}`}
                    {e.drawType === "lazada_sorteada" && e.lazadaShotsPerPackage !== null && ` · ${e.lazadaShotsPerPackage} ${t.event.shotsPerPackage.toLowerCase()}`}
                  </p>
                  {e.series && <p className="mt-1 text-sm"><Link href={`/${lang}/organizador/series/${e.series.slug}`} className="font-medium text-brand-hot hover:underline">{t.org.ev.partOfSeries}: {e.series.name} →</Link></p>}
                </div>
                <div className="flex gap-2">
                  {e.status !== "borrador" && <Link href={`/${lang}/eventos/${e.id}`} className="rounded-full bg-sand px-4 py-2 text-sm font-medium hover:bg-line">{t.org.ev.publicPage}</Link>}
                  {e.status !== "finalizado" && <Link href={`/${lang}/organizador/eventos/${e.id}/editar`} className="rounded-full bg-sand px-4 py-2 text-sm font-medium hover:bg-line">{t.org.form.edit}</Link>}
                  {e.status !== "finalizado" && (
                    <form action={setEventStatus}>
                      <input type="hidden" name="id" value={e.id} /><input type="hidden" name="lang" value={lang} />
                      <button className={`rounded-full px-4 py-2 text-sm font-medium transition ${e.status === "borrador" ? "bg-brand text-white hover:bg-brand-hot" : "bg-sand hover:bg-line"}`}>{e.status === "borrador" ? t.org.ev.publish : t.org.ev.toDraft}</button>
                    </form>
                  )}
                </div>
              </div>
              {missing.length > 0 && (
                <div role="alert" data-testid="publish-missing" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-medium">{t.org.ev.publishMissing}</p>
                  <ul className="mt-1 list-disc pl-5">{missing.map((m) => <li key={m}>{t.org.ev.missingField[m]}</li>)}</ul>
                  <Link href={`/${lang}/organizador/eventos/${e.id}/editar`} className="mt-2 inline-block font-medium underline">{t.org.form.edit} →</Link>
                </div>
              )}
              {pagoError && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t.pay.error}</p>}
              {sacadoMsg && <p role="status" className={`mt-6 rounded-2xl p-4 text-sm ${["ok", "reenroll", "refund"].includes(sacado!) ? "bg-brand-soft font-medium" : "bg-red-50 text-red-800"}`}>{sacadoMsg}</p>}
              {justEdited && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{t.org.form.saved}</p>}
              <section aria-labelledby="share" className={`mt-6 rounded-2xl p-5 ${justCreated === "publicado" ? "bg-brand-soft" : "card"}`}>
                {justCreated === "publicado" && <><h2 className="text-lg font-semibold">{t.org.share.publishedTitle}</h2><p className="mt-1 text-sm">{t.org.share.publishedText}</p></>}
                {justCreated === "borrador" && <><h2 className="text-lg font-semibold">{t.org.share.draftTitle}</h2><p className="mt-1 text-sm">{t.org.share.draftText}</p></>}
                <h3 id="share" className={`font-semibold ${justCreated ? "mt-4 text-sm" : "text-base"}`}>{t.org.share.title}</h3>
                {!justCreated && <p className="mt-0.5 text-sm text-muted">{t.org.share.hint}</p>}
                <CopyLink url={shareUrl} copy={t.org.share.copy} copied={t.org.share.copied} whatsappLabel={t.org.share.whatsapp} whatsappText={t.org.share.whatsappText} />
                {e.status === "borrador" && <p className="mt-2 text-xs text-muted">{t.org.share.draftLink}</p>}
              </section>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="card p-4"><p className="text-2xl font-semibold tabular-nums">{e.enrolled}/{e.capacity}</p><p className="label mt-1">{t.org.enrolled}</p></div>
                <div className="card p-4"><p className="text-2xl font-semibold tabular-nums">{rows.filter((x) => x.paymentStatus === "pagado").length}</p><p className="label mt-1">{t.org.ev.paid}</p></div>
                <div className="card p-4"><p className="text-2xl font-semibold">{stateLabel[e.status]}</p><p className="label mt-1">{t.org.ev.state}</p></div>
              </div>
              {e.status !== "borrador" && (
                <section aria-labelledby="registration" className="card mt-6 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 id="registration" className="text-lg font-semibold">{t.org.ev.registration} <span className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${regOpen ? "bg-brand-soft text-brand-hot" : "bg-sand text-muted"}`}>{regOpen ? t.org.ev.regOpen : notYet ? t.org.ev.regNotYet : t.org.ev.regClosed}</span></h2>
                      {e.registrationOpensAt && <p className="mt-1 text-sm text-muted">{t.org.ev.opensAt} {fmtDeadline(e.registrationOpensAt, e.timezone, lang)}</p>}
                      <p className="mt-1 text-sm text-muted">{e.registrationClosesAt ? `${t.org.ev.closesAt} ${fmtDeadline(e.registrationClosesAt, e.timezone, lang)}` : t.org.ev.noDeadline}</p>
                    </div>
                    {e.status === "publicado" && !notYet && (
                      <form action={setRegistrationOpen}>
                        <input type="hidden" name="id" value={e.id} /><input type="hidden" name="lang" value={lang} /><input type="hidden" name="open" value={regOpen ? "false" : "true"} />
                        <button className={`rounded-full px-4 py-2 text-sm font-medium transition ${regOpen ? "bg-sand hover:bg-line" : "bg-brand text-white hover:bg-brand-hot"}`}>{regOpen ? t.org.ev.closeNow : t.org.ev.reopen}</button>
                      </form>
                    )}
                  </div>
                  {!regOpen && e.status === "publicado" && e.registrationClosesAt && <p className="mt-2 text-xs text-muted">{t.org.ev.reopenHint}</p>}
                  {e.status === "publicado" && (
                    <form action={enrollByOrganizer} className="mt-5 border-t border-line pt-5">
                      <h3 className="text-sm font-semibold">{t.org.ev.manualTitle}</h3>
                      <p className="mt-0.5 text-xs text-muted">{t.org.ev.manualHint}</p>
                      {manualMsg && <p role="status" className={`mt-3 rounded-xl p-3 text-sm ${manual === "ok" ? "bg-brand-soft font-medium" : "bg-red-50 text-red-800"}`}>{manualMsg}</p>}
                      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="event" value={e.id} />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input required type="email" name="email" maxLength={200} aria-label={t.org.ev.manualEmail} placeholder={t.org.ev.manualEmail} className={`${field} min-w-56 flex-1`} />
                        <select required name="category" aria-label={t.org.ev.manualCategory} className={field}>
                          {e.categories.map((c) => <option key={c.id} value={c.id}>{c.name} · {mxn(c.fee, lang)}</option>)}
                        </select>
                        {e.drawType === "lazada_sorteada" && <input type="number" name="packages" min={1} max={99} step={1} defaultValue={1} aria-label={t.org.ev.manualPackages} title={t.org.ev.manualPackages} className={`${field} w-24 tabular-nums`} />}
                        <select name="role" aria-label={t.org.ev.manualRole} className={field}>
                          <option value="">{t.org.ev.manualRole}: {t.org.ev.manualRoleAuto}</option>
                          <option value="header">{t.roles.header}</option><option value="heeler">{t.roles.heeler}</option><option value="both">{t.org.ev.manualBoth}</option>
                        </select>
                        <button className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand-hot">{t.org.ev.manualSubmit}</button>
                      </div>
                    </form>
                  )}
                </section>
              )}
              <div className="card mt-8 p-6">
                <EventPhotos eventSlug={e.id} photos={e.photos} coverUrl={e.cover ?? null}
                  l={{ title: t.uploader.eventPhotos, add: t.uploader.add, hint: t.uploader.hint, cover: t.uploader.cover, makeCover: t.uploader.makeCover, remove: t.uploader.remove, confirmRemove: t.uploader.confirmRemove, uploading: t.uploader.uploading, empty: t.uploader.empty, tooBig: t.uploader.tooBig, invalid: t.uploader.invalid, limit: t.uploader.limit, failed: t.uploader.failed }} />
              </div>
              <h2 className="mt-10 text-xl font-semibold">{t.org.ev.enrolledTitle}</h2>
              <div className="mt-3 space-y-3 sm:hidden">
                {rows.length === 0 && <p className="rounded-2xl bg-sand p-4 text-muted">{t.org.ev.noneEnrolled}</p>}
                {rows.map((r) => (
                  <div key={r.id} className="card p-4">
                    <Link href={`/${lang}/participantes/${r.roperId}`} className="font-semibold hover:text-brand-hot">{r.name}</Link>
                    <p className="mt-0.5 text-sm text-muted">{r.category}{r.role ? ` · ${t.roles[r.role as "header" | "heeler"]}` : ""}{r.email ? ` · ${r.email}` : ""}</p>
                    <div className="mt-3"><PaymentCell r={r} lang={lang} slug={e.id} t={t} /></div>
                    <div className="mt-3">{removeButton(r)}</div>
                  </div>
                ))}
              </div>
              <div className="card mt-3 hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sand label"><tr><th className="p-3">{t.org.ev.participant}</th><th>{t.org.ev.phone}</th><th>{t.org.ev.category}</th><th>{t.org.ev.role}</th><th>{t.org.ev.payment}</th><th><span className="sr-only">{rm.button}</span></th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      return (
                        <tr key={r.id} className="border-t border-line">
                          <td className="p-3 font-medium"><Link href={`/${lang}/participantes/${r.roperId}`} className="hover:text-brand-hot">{r.name}</Link></td>
                          <td className="text-muted">{r.email ?? "–"}</td><td>{r.category}</td><td>{r.role ? t.roles[r.role as "header" | "heeler"] : "–"}</td>
                          <td className="py-2 pr-3"><PaymentCell r={r} lang={lang} slug={e.id} t={t} /></td>
                          <td className="py-2 pr-3 text-right">{removeButton(r)}</td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={6} className="p-4 text-muted">{t.org.ev.noneEnrolled}</td></tr>}
                  </tbody>
                </table>
              </div>
              <section aria-labelledby="removed" className="mt-10">
                <h2 id="removed" className="text-xl font-semibold">{rm.removedTitle}</h2>
                <div className="mt-3 space-y-3">
                  {removals.length === 0 && <p className="rounded-2xl bg-sand p-4 text-muted">{rm.none}</p>}
                  {removals.map((x) => (
                    <div key={x.id} className="card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <Link href={`/${lang}/participantes/${x.roperId}`} className="font-semibold hover:text-brand-hot">{x.name}</Link>
                          <p className="text-sm text-muted">{x.category} · {rm.on} {fmtDate(x.removedAt.slice(0, 10), lang)}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${x.paymentStatus === "pagado" ? (x.refundPending ? "bg-amber-100 text-amber-900" : "bg-brand-soft text-brand-hot") : "bg-sand text-muted"}`}>
                          {x.paymentStatus === "pagado" ? (x.refundPending ? rm.refundPending : rm.refundDone) : rm.notPaid}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm">{x.reason}</p>
                      {x.paymentStatus === "pagado" && <p className="mt-1 text-xs text-muted">{rm.by} {mxn(x.amountCents / 100, lang)} · {t.pay.method[(x.paymentMethod ?? "efectivo") as "efectivo" | "transferencia" | "stripe"]}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {x.paymentStatus === "pagado" && (
                          <form action={setRemovalRefunded}>
                            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={e.id} /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="done" value={x.refundPending ? "true" : "false"} />
                            <button className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-brand-hot">{x.refundPending ? rm.markRefunded : rm.undoRefund}</button>
                          </form>
                        )}
                        <form action={setRemovalReenroll}>
                          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={e.id} /><input type="hidden" name="id" value={x.id} /><input type="hidden" name="allow" value={x.canReenroll ? "false" : "true"} />
                          <button className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-ink hover:text-ink">{x.canReenroll ? rm.block : rm.allow}</button>
                        </form>
                        <span className="text-xs text-muted">{x.canReenroll ? rm.allowed : rm.blocked}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section aria-labelledby="results" className="mt-14">
                <h2 id="results" className="text-xl font-semibold">{t.org.res.title}</h2>
                <div className="card mt-3 p-4 text-sm">
                  <p className="text-muted">{t.org.res.fromApp}</p>
                  <p className="mt-2">{t.org.res.lastSync}: <span className="font-medium">{sync.lastSyncAt ? fmtDeadline(sync.lastSyncAt, e.timezone, lang) : t.org.res.never}</span>{sync.count > 0 && <span className="text-muted"> · {t.org.res.count(sync.count)}</span>}</p>
                  {sync.count > 0 && <p className="mt-1">{sync.closedAt ? `${t.org.res.closed} ${fmtDeadline(sync.closedAt, e.timezone, lang)}` : t.org.res.open}</p>}
                  <p className="mt-1 text-xs text-muted">{t.org.res.rating}</p>
                </div>
                {e.uuid && e.status !== "borrador" && sync.count > 0 ? (
                  <Suspense fallback={<EnrolledSkeleton />}>
                    <EventResultsSection slug={e.id} uuid={e.uuid} disciplines={resultDisciplines} lang={lang} t={t} />
                  </Suspense>
                ) : <p className="mt-3 text-muted">{e.status === "borrador" ? t.org.res.notPublic : t.org.res.empty}</p>}
              </section>
              <section aria-labelledby="danger" className="mt-14 rounded-2xl border border-red-200 p-5">
                <h2 id="danger" className="text-lg font-semibold text-red-800">{t.org.del.zone}</h2>
                <p className="mt-1 text-sm text-muted">{t.org.del.eventText}</p>
                {borrarError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(t.org.del.errors as Record<string, string>)[borrarError] ?? t.org.del.errors.failed}</p>}
                <div className="mt-4">
                  {e.status === "finalizado" || !e.uuid ? <p className="text-sm text-muted">{t.org.del.finishedNote}</p> : (
                    <DeleteConfirmDialog
                      action={deleteEvent} lang={lang} id={e.uuid} fields={{ slug: e.id, id: e.uuid }} needReason={e.enrolled > 0}
                      summary={[[t.org.del.name, e.name], [t.org.del.date, e.date ? fmtDate(e.date, lang) : "–"], [t.org.del.enrolled, String(e.enrolled)]]}
                      l={{ button: t.org.del.eventButton, title: t.org.del.eventTitle, typePrompt: t.org.del.typePrompt(t.org.del.word), word: t.org.del.word, reasonLabel: t.org.del.reasonLabel, reasonPlaceholder: t.org.del.reasonPlaceholder, minChars: t.org.del.minChars, notify: e.enrolled > 0 ? t.org.del.notify(e.enrolled) : null, cancel: t.org.del.cancel, confirm: t.org.del.confirm }}
                    />
                  )}
                </div>
              </section>
            </div>
          </>
  );
}

async function Resolver({ props }: { props: PageProps<"/[lang]/organizador/eventos/[id]"> }) {
  const lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const justEdited = sp.editado === "1";
  const pagoError = sp.pagoError === "1";
  const manual = typeof sp.manual === "string" ? sp.manual : null;
  const sacado = typeof sp.sacado === "string" ? sp.sacado : null;
  const missing = parseMissing(sp.faltan);
  const borrarError = typeof sp.borrarError === "string" ? sp.borrarError : null;
  const justCreated = sp.nuevo === "publicado" ? "publicado" : sp.nuevo === "borrador" ? "borrador" : null;
  // Enlace sin idioma: cada persona que lo abra llega a su idioma (el proxy elige es/en por su navegador).
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${proto}://${host}/eventos/${id}`;
  const t = getDictionary(lang);
  const stateLabel: Record<string, string> = { publicado: t.status.published, borrador: t.status.draft, finalizado: t.status.finished };
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/eventos/${id}`}>
      {(s) => <Manage s={s} id={id} lang={lang} t={t} justCreated={justCreated} justEdited={justEdited} pagoError={pagoError} manual={manual} sacado={sacado} missing={missing} borrarError={borrarError} shareUrl={shareUrl} stateLabel={stateLabel} />}
    </Gate>
  );
}

export default function GestionarEvento(props: PageProps<"/[lang]/organizador/eventos/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><Resolver props={props} /></Suspense>;
}
