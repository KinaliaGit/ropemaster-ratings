import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { getPublicRoper, getRoperResults } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { fmtDate } from "@/lib/format";
import { fmtRating, fmtTime, initials, publicAvatarUrl } from "@/lib/people";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function PerfilInner({ params }: { params: PageProps<"/[lang]/participantes/[id]">["params"] }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang = await resolveLang(params);
  const { id } = await params;
  const t = getDictionary(lang);
  const [r, results] = await Promise.all([getPublicRoper(id), getRoperResults(id)]);
  if (!r) notFound();
  const modes = ACTIVE_DISCIPLINES.filter((d) => r.stats[d.id]);
  const totalEvents = modes.reduce((n, d) => n + r.stats[d.id]!.events, 0);
  const totalWins = modes.reduce((n, d) => n + r.stats[d.id]!.wins, 0);
  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-12">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={r.name} initials={initials(r.name)} url={publicAvatarUrl(r.avatarPath)} className="size-20 text-2xl" />
        <div className="flex-1">
          <h1 className="text-4xl font-semibold">{r.name}</h1>
        </div>
        <div className="flex gap-8 text-right">
          {modes.map((d) => (
            <div key={d.id}>
              <p className="text-6xl font-semibold leading-none tabular-nums">{fmtRating(r.stats[d.id]!.rating)}<span className="text-2xl text-muted">/10</span></p>
              <p className="label mt-2">{modes.length > 1 ? t.disc[d.id].label : t.people.rating}</p>
            </div>
          ))}
        </div>
      </div>
      <dl className="mt-8 grid grid-cols-3 border-y border-line py-5 text-center">
        {[[totalEvents, t.people.eventsWord], [totalWins, t.people.winsWord], [results.length, t.people.resultsWord]].map(([n, l]) => <div key={l}><dd className="text-2xl font-semibold tabular-nums">{n}</dd><dt className="text-sm text-muted">{l}</dt></div>)}
      </dl>

      <h2 className="mt-10 text-xl font-semibold">{t.people.history}</h2>
      {results.length === 0 ? <p className="mt-3 text-muted">{t.people.noHistory}</p> : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-sand label"><tr><th className="p-3">{t.people.event}</th><th>{t.people.date}</th><th>{t.people.discipline}</th><th>{t.people.time}</th><th>{t.people.place}</th></tr></thead>
            <tbody>
              {results.map((x) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="p-3 font-medium">
                    {x.eventSlug ? <Link href={`/${lang}/eventos/${x.eventSlug}`} className="hover:text-brand-hot">{x.event}</Link> : x.event}
                    {x.eventVerified && <span className="ml-1 text-brand" title={t.people.verifiedEvent}>✓</span>}
                  </td>
                  <td className="tabular-nums">{x.date ? fmtDate(x.date, lang) : "–"}</td>
                  <td>{t.disc[x.discipline as "lazo"]?.label ?? x.discipline}</td>
                  <td className="tabular-nums">{x.disqualified ? t.people.dq : fmtTime(x.timeMs)}{!x.disqualified && x.penaltyMs > 0 && <span className="text-muted"> (+{fmtTime(x.penaltyMs)})</span>}</td>
                  <td className="tabular-nums">{x.place != null ? `#${x.place}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{t.people.contactNote} <Link href={`/${lang}/registro`} className="underline">{t.people.report}</Link>.</p>
    </div>
  );
}

export default function Perfil(props: PageProps<"/[lang]/participantes/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PerfilInner params={props.params} />
    </Suspense>
  );
}
