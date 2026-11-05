import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { StripeConnectButton } from "@/components/StripeConnectButton";
import { listOrganizerEvents } from "@/lib/data/events";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Session } from "@/lib/session";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

const badge: Record<string, string> = { publicado: "bg-brand-soft text-brand-hot", borrador: "bg-sand text-muted", finalizado: "bg-ink text-white" };

async function Panel({ s, lang, t, welcome }: { s: Session; lang: Lang; t: Dict; welcome: boolean }) {
  const mine = await listOrganizerEvents(s.id);
  const stateLabel: Record<string, string> = { publicado: t.status.published, borrador: t.status.draft, finalizado: t.status.finished };
  const stats = [[t.org.events, mine.length], [t.status.published, mine.filter((e) => e.status === "publicado").length], [t.org.collected, mxn(0, lang)]];
  return (
    <>
      <OrgNav lang={lang} t={t} admin={s.isAdmin} />
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
        {welcome && <p role="status" className="mb-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{t.org.welcome}</p>}
        {!s.verified && (
          <div role="note" className="mb-6 rounded-2xl border border-line bg-sand p-4 text-sm">
            <p className="font-semibold">{t.org.verify.title}</p>
            <p className="mt-1 text-muted">{t.org.verify.text}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label">{t.org.accountType}</p>
            <h1 className="text-3xl font-semibold">{s.name}</h1>
          </div>
          <Link href={`/${lang}/organizador/eventos/nuevo`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{t.org.newEvent}</Link>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          {stats.map(([l, v]) => <div key={l} className="card p-4"><dd className="text-3xl font-semibold tabular-nums">{v}</dd><dt className="label mt-1">{l}</dt></div>)}
        </dl>
        <StripeConnectButton lang={lang} {...t.org.stripe} />
        <h2 className="mt-10 text-xl font-semibold">{t.org.myEvents}</h2>
        {mine.length === 0 ? <p className="mt-3 rounded-2xl bg-sand p-6 text-center text-muted">{t.org.noEvents}</p> : (
          <div className="card mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-sand label"><tr><th className="p-3">{t.org.tbl.event}</th><th>{t.org.tbl.date}</th><th>{t.org.tbl.state}</th><th>{t.org.tbl.enrolled}</th><th></th></tr></thead>
              <tbody>
                {mine.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="p-3 font-medium">{e.name}</td>
                    <td className="tabular-nums">{e.date ? fmtDate(e.date, lang) : "–"}</td>
                    <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[e.status]}`}>{stateLabel[e.status]}</span></td>
                    <td className="tabular-nums">{e.enrolled}/{e.capacity}</td>
                    <td className="pr-3 text-right"><Link href={`/${lang}/organizador/eventos/${e.id}`} className="font-medium text-brand-hot hover:underline">{t.org.manage} →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
      {(s) => <Panel s={s} lang={lang} t={t} welcome={sp.bienvenido === "1"} />}
    </Gate>
  );
}

export default function PanelPage(props: PageProps<"/[lang]/organizador">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
