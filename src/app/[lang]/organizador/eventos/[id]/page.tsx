import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CopyLink } from "@/components/CopyLink";
import { setEventStatus } from "@/lib/event-actions";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { listEventRegistrations } from "@/lib/data/registrations";
import { setRegistrationPayment } from "@/lib/payment-actions";
import { EventPhotos } from "@/components/EventPhotos";
import { getOrganizerEvent } from "@/lib/data/events";
import type { Session } from "@/lib/session";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

type ManageProps = { s: Session; id: string; lang: Lang; t: Dict; justCreated: "publicado" | "borrador" | null; justEdited: boolean; pagoError: boolean; shareUrl: string; stateLabel: Record<string, string> };

function PayForm({ lang, slug, id, method, label, tone }: { lang: Lang; slug: string; id: string; method: string; label: string; tone: "solid" | "ghost" }) {
  return (
    <form action={setRegistrationPayment}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={id} /><input type="hidden" name="method" value={method} />
      <button className={tone === "solid" ? "rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-brand-hot" : "rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-ink hover:text-ink"}>{label}</button>
    </form>
  );
}

async function Manage({ s, id, lang, t, justCreated, justEdited, pagoError, shareUrl, stateLabel }: ManageProps) {
  // Un organizador solo gestiona sus propios eventos (la base además lo impone).
  const e = await getOrganizerEvent(s.id, id);
  if (!e) notFound();
  const rows = await listEventRegistrations(e.uuid!);
  return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
              <Link href={`/${lang}/organizador`} className="text-sm text-muted hover:text-ink">← {t.org.ev.back}</Link>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-semibold">{e.name}</h1>
                  <p className="text-muted">{e.date ? fmtDate(e.date, lang) : "–"} · {e.venue}, {e.city}</p>
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
              {pagoError && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{t.pay.error}</p>}
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
              <div className="card mt-8 p-6">
                <EventPhotos eventSlug={e.id} photos={e.photos} coverUrl={e.cover ?? null}
                  l={{ title: t.uploader.eventPhotos, add: t.uploader.add, hint: t.uploader.hint, cover: t.uploader.cover, makeCover: t.uploader.makeCover, remove: t.uploader.remove, confirmRemove: t.uploader.confirmRemove, uploading: t.uploader.uploading, empty: t.uploader.empty, tooBig: t.uploader.tooBig, invalid: t.uploader.invalid, limit: t.uploader.limit, failed: t.uploader.failed }} />
              </div>
              <h2 className="mt-10 text-xl font-semibold">{t.org.ev.enrolledTitle}</h2>
              <div className="card mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sand label"><tr><th className="p-3">{t.org.ev.participant}</th><th>{t.org.ev.phone}</th><th>{t.org.ev.category}</th><th>{t.org.ev.payment}</th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const paid = r.paymentStatus === "pagado";
                      return (
                        <tr key={r.id} className="border-t border-line">
                          <td className="p-3 font-medium"><Link href={`/${lang}/participantes/${r.roperId}`} className="hover:text-brand-hot">{r.name}</Link></td>
                          <td className="text-muted">{r.email ?? "–"}</td><td>{r.category}</td>
                          <td className="py-2 pr-3">
                            {paid ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-brand-hot">{t.org.ev.paidAmount} {mxn(r.amountCents / 100, lang)} · {t.pay.method[(r.paymentMethod ?? "efectivo") as "efectivo" | "transferencia" | "stripe"]}</span>
                                {r.paymentMethod !== "stripe" && <PayForm lang={lang} slug={e.id} id={r.id} method="pendiente" label={t.pay.undo} tone="ghost" />}
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-red-700">{t.org.ev.pending}</span>
                                <span className="text-xs text-muted">{t.pay.markPaid}</span>
                                <PayForm lang={lang} slug={e.id} id={r.id} method="efectivo" label={t.pay.method.efectivo} tone="solid" />
                                <PayForm lang={lang} slug={e.id} id={r.id} method="transferencia" label={t.pay.method.transferencia} tone="solid" />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={4} className="p-4 text-muted">{t.org.ev.noneEnrolled}</td></tr>}
                  </tbody>
                </table>
              </div>
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
      {(s) => <Manage s={s} id={id} lang={lang} t={t} justCreated={justCreated} justEdited={justEdited} pagoError={pagoError} shareUrl={shareUrl} stateLabel={stateLabel} />}
    </Gate>
  );
}

export default function GestionarEvento(props: PageProps<"/[lang]/organizador/eventos/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><Resolver props={props} /></Suspense>;
}
