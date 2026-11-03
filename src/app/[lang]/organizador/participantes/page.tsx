import Link from "next/link";
import { Suspense } from "react";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { ropers, statOf, fmtRating } from "@/lib/mock";
import { ACTIVE_DISCIPLINES, DEFAULT_DISCIPLINE } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ params }: { params: PageProps<"/[lang]/organizador/participantes">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const dir = t.org.dir;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/participantes`}>
      {() => (
        <>
          <OrgNav lang={lang} t={t} />
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
            <h1 className="text-3xl font-semibold">{dir.title}</h1>
            <p className="mt-1 text-sm text-muted">{dir.blurb}</p>
            <div className="card mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-sand label">
                  <tr>
                    <th className="p-3">{dir.name}</th><th>{dir.phone}</th>
                    {ACTIVE_DISCIPLINES.map((d) => <th key={d.id}>{dir.rating}{ACTIVE_DISCIPLINES.length > 1 ? ` · ${t.disc[d.id].label}` : ""}</th>)}
                    <th>{dir.events}</th><th>{dir.wins}</th><th>{dir.profile}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...ropers].sort((a, b) => (statOf(b)?.rating ?? 0) - (statOf(a)?.rating ?? 0)).map((r) => {
                    const main = statOf(r, DEFAULT_DISCIPLINE);
                    return (
                      <tr key={r.id} className="border-t border-line">
                        <td className="p-3 font-medium"><Link href={`/${lang}/participantes/${r.id}`} className="hover:text-brand-hot">{r.name}</Link></td>
                        <td className="tabular-nums">{r.phone}</td>
                        {ACTIVE_DISCIPLINES.map((d) => <td key={d.id} className="tabular-nums">{statOf(r, d.id) ? fmtRating(statOf(r, d.id)!.rating) : "–"}</td>)}
                        <td className="tabular-nums">{main?.events ?? 0}</td><td className="tabular-nums">{main?.wins ?? 0}</td>
                        <td>{r.verified ? `${dir.verified} ✓` : dir.unclaimed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Gate>
  );
}

export default function ParticipantesOrg(props: PageProps<"/[lang]/organizador/participantes">) {
  return <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">…</p>}><Page params={props.params} /></Suspense>;
}
