import Link from "next/link";
import { Suspense } from "react";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { StripeConnectButton } from "@/components/StripeConnectButton";
import { events } from "@/lib/mock";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

const badge: Record<string, string> = { publicado: "bg-brand-soft text-brand-hot", borrador: "bg-sand text-muted", finalizado: "bg-ink text-white" };

async function Page({ params }: { params: PageProps<"/[lang]/organizador">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const stateLabel: Record<string, string> = { publicado: t.status.published, borrador: t.status.draft, finalizado: t.status.finished };
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador`}>
      {(s) => {
        const mine = events.filter((e) => e.organizer === s.id);
        const inscritos = mine.reduce((n, e) => n + e.registered.length, 0);
        const ingresos = mine.reduce((n, e) => n + e.registered.filter((r) => !e.unpaid?.includes(r)).length * e.categories[0].fee, 0);
        const stats = [[t.org.events, mine.length], [t.org.enrolled, inscritos], [t.org.collected, mxn(ingresos, lang)]];
        return (
          <>
            <OrgNav lang={lang} t={t} />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
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
              <div className="card mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sand label"><tr><th className="p-3">{t.org.tbl.event}</th><th>{t.org.tbl.date}</th><th>{t.org.tbl.state}</th><th>{t.org.tbl.enrolled}</th><th></th></tr></thead>
                  <tbody>
                    {mine.map((e) => (
                      <tr key={e.id} className="border-t border-line">
                        <td className="p-3 font-medium">{e.name}</td>
                        <td className="tabular-nums">{fmtDate(e.date, lang)}</td>
                        <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[e.status]}`}>{stateLabel[e.status]}</span></td>
                        <td className="tabular-nums">{e.registered.length}/{e.capacity}</td>
                        <td className="pr-3 text-right"><Link href={`/${lang}/organizador/eventos/${e.id}`} className="font-medium text-brand-hot hover:underline">{t.org.manage} →</Link></td>
                      </tr>
                    ))}
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

export default function Panel(props: PageProps<"/[lang]/organizador">) {
  return <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">…</p>}><Page params={props.params} /></Suspense>;
}
