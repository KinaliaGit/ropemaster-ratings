import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CopyLink } from "@/components/CopyLink";
import { setEventStatus } from "@/lib/event-actions";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { PhotoUploader } from "@/components/PhotoUploader";
import { events, ropers, statOf, fmtRating } from "@/lib/mock";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Resolver({ props }: { props: PageProps<"/[lang]/organizador/eventos/[id]"> }) {
  const lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
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
      {(s) => {
        const e = events.find((x) => x.id === id);
        // Un organizador solo gestiona sus propios eventos.
        if (!e || e.organizer !== s.id) notFound();
        const d = e.disciplines[0] as "lazo";
        const rows = e.registered.map((rid) => ({ r: ropers.find((x) => x.id === rid)!, paid: !e.unpaid?.includes(rid) }));
        return (
          <>
            <OrgNav lang={lang} t={t} />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
              <Link href={`/${lang}/organizador`} className="text-sm text-muted hover:text-ink">← {t.org.ev.back}</Link>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-semibold">{e.name}</h1>
                  <p className="text-muted">{fmtDate(e.date, lang)} · {e.venue}, {e.city}</p>
                </div>
                <div className="flex gap-2">
                  {e.status !== "borrador" && <Link href={`/${lang}/eventos/${e.id}`} className="rounded-full bg-sand px-4 py-2 text-sm font-medium hover:bg-line">{t.org.ev.publicPage}</Link>}
                  {e.status !== "finalizado" && (
                    <form action={setEventStatus}>
                      <input type="hidden" name="id" value={e.id} /><input type="hidden" name="lang" value={lang} />
                      <button className={`rounded-full px-4 py-2 text-sm font-medium transition ${e.status === "borrador" ? "bg-brand text-white hover:bg-brand-hot" : "bg-sand hover:bg-line"}`}>{e.status === "borrador" ? t.org.ev.publish : t.org.ev.toDraft}</button>
                    </form>
                  )}
                </div>
              </div>
              <section aria-labelledby="share" className={`mt-6 rounded-2xl p-5 ${justCreated === "publicado" ? "bg-brand-soft" : "card"}`}>
                {justCreated === "publicado" && <><h2 className="text-lg font-semibold">{t.org.share.publishedTitle}</h2><p className="mt-1 text-sm">{t.org.share.publishedText}</p></>}
                {justCreated === "borrador" && <><h2 className="text-lg font-semibold">{t.org.share.draftTitle}</h2><p className="mt-1 text-sm">{t.org.share.draftText}</p></>}
                <h3 id="share" className={`font-semibold ${justCreated ? "mt-4 text-sm" : "text-base"}`}>{t.org.share.title}</h3>
                {!justCreated && <p className="mt-0.5 text-sm text-muted">{t.org.share.hint}</p>}
                <CopyLink url={shareUrl} copy={t.org.share.copy} copied={t.org.share.copied} whatsappLabel={t.org.share.whatsapp} whatsappText={t.org.share.whatsappText} />
                {e.status === "borrador" && <p className="mt-2 text-xs text-muted">{t.org.share.draftLink}</p>}
              </section>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="card p-4"><p className="text-2xl font-semibold tabular-nums">{e.registered.length}/{e.capacity}</p><p className="label mt-1">{t.org.enrolled}</p></div>
                <div className="card p-4"><p className="text-2xl font-semibold tabular-nums">{rows.filter((x) => x.paid).length}</p><p className="label mt-1">{t.org.ev.paid}</p></div>
                <div className="card p-4"><p className="text-2xl font-semibold">{stateLabel[e.status]}</p><p className="label mt-1">{t.org.ev.state}</p></div>
              </div>
              <div className="card mt-8 p-6"><PhotoUploader labels={{ title: t.uploader.eventPhotos, add: t.uploader.add, hint: t.uploader.hint, cover: t.uploader.cover }} /></div>
              <h2 className="mt-10 text-xl font-semibold">{t.org.ev.enrolledTitle}</h2>
              <div className="card mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sand label"><tr><th className="p-3">{t.org.ev.participant}</th><th>{t.org.ev.phone}</th><th>{t.org.ev.rating}</th><th>{t.org.ev.category}</th><th>{t.org.ev.payment}</th></tr></thead>
                  <tbody>
                    {rows.map(({ r, paid }) => {
                      const st = statOf(r, d);
                      return (
                        <tr key={r.id} className="border-t border-line">
                          <td className="p-3 font-medium"><Link href={`/${lang}/participantes/${r.id}`} className="hover:text-brand-hot">{r.name}</Link></td>
                          <td className="tabular-nums">{r.phone}</td><td className="tabular-nums">{st ? fmtRating(st.rating) : "–"}</td><td>{e.categories[0].name}</td>
                          <td className={`font-medium ${paid ? "text-brand-hot" : "text-red-700"}`}>{paid ? `${t.org.ev.paidAmount} ${mxn(e.categories[0].fee, lang)}` : t.org.ev.pending}</td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-muted">{t.org.ev.noneEnrolled}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function GestionarEvento(props: PageProps<"/[lang]/organizador/eventos/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><Resolver props={props} /></Suspense>;
}
