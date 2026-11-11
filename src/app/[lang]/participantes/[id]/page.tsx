import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { ProfileHistory } from "@/components/ProfileHistory";
import { HistorySkeleton, ProfileSkeleton } from "@/components/ProfileSkeleton";
import { getPublicRoper, getRoperHistory, getRoperSummary } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import type { Lang } from "@/lib/format";
import { fmtRating, fmtTime, initials, publicAvatarUrl } from "@/lib/people";
import { toHistoryItem } from "@/lib/results-view";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Dict } from "@/dictionaries/es";

// Totales y historial: van aparte para que el nombre y el rating salgan sin esperar a los resultados (KIN-609 y KIN-611).
async function History({ id, lang, t }: { id: string; lang: Lang; t: Dict }) {
  const [summary, page] = await Promise.all([getRoperSummary(id), getRoperHistory(id)]);
  const p = t.people;
  const runs = ACTIVE_DISCIPLINES.filter((d) => summary.bestRuns[d.id] != null);
  const stats: [string, string][] = [
    [String(summary.events), p.eventsWord],
    [String(summary.wins), p.winsWord],
    [summary.bestPlace != null ? `#${summary.bestPlace}` : "–", p.bestPlace],
    ...runs.map((d): [string, string] => [fmtTime(summary.bestRuns[d.id]), ACTIVE_DISCIPLINES.length > 1 ? `${p.bestRun} · ${t.disc[d.id].label}` : p.bestRun]),
  ];
  return (
    <>
      <dl className="mt-8 grid grid-cols-2 gap-y-4 border-y border-line py-5 text-center sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
        {stats.map(([n, l]) => <div key={l}><dd className="text-2xl font-semibold tabular-nums">{n}</dd><dt className="text-sm text-muted">{l}</dt></div>)}
      </dl>

      <h2 className="mt-10 text-xl font-semibold">{p.history}</h2>
      {page.rows.length === 0 ? <p className="mt-3 text-muted">{p.noHistory}</p> : (
        <ProfileHistory
          roperId={id} lang={lang} initial={page.rows.map((r) => toHistoryItem(r, lang, t))} next={page.next}
          labels={{
            event: p.event, date: p.date, discipline: p.discipline, time: p.time, place: p.place, verifiedEvent: p.verifiedEvent,
            loadMore: p.loadMore, loadError: p.loadError, retry: p.retry, viewRounds: p.viewRounds, hideRounds: p.hideRounds, noRounds: p.noRounds,
          }}
        />
      )}
    </>
  );
}

async function PerfilInner({ params }: { params: PageProps<"/[lang]/participantes/[id]">["params"] }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang = await resolveLang(params);
  const { id } = await params;
  const t = getDictionary(lang);
  const r = await getPublicRoper(id);
  if (!r) notFound();
  const modes = ACTIVE_DISCIPLINES.filter((d) => r.stats[d.id]);
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

      <Suspense fallback={<HistorySkeleton />}>
        <History id={r.id} lang={lang} t={t} />
      </Suspense>

      <p className="mt-6 text-xs text-muted">{t.people.contactNote} <Link href={`/${lang}/registro`} className="underline">{t.people.report}</Link>.</p>
    </div>
  );
}

export default function Perfil(props: PageProps<"/[lang]/participantes/[id]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <PerfilInner params={props.params} />
    </Suspense>
  );
}
