import { ProfileHistory } from "@/components/ProfileHistory";
import { getRoperHistory, getRoperSummary } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { fmtTime } from "@/lib/people";
import { toHistoryItem } from "@/lib/results-view";
import type { Lang } from "@/lib/format";
import type { Dict } from "@/dictionaries/es";

// Totales y mejores tiempos del lazador, en una ficha compacta (arriba en «Mi cuenta» y en el perfil público).
export async function RoperStats({ id, t }: { id: string; t: Dict }) {
  const summary = await getRoperSummary(id);
  const p = t.people;
  const runs = ACTIVE_DISCIPLINES.filter((d) => summary.bestRuns[d.id] != null);
  const stats: [string, string][] = [
    [String(summary.events), p.eventsWord],
    [String(summary.wins), p.winsWord],
    [summary.bestPlace != null ? `#${summary.bestPlace}` : "–", p.bestPlace],
    ...runs.map((d): [string, string] => [fmtTime(summary.bestRuns[d.id]), ACTIVE_DISCIPLINES.length > 1 ? `${p.bestRun} · ${t.disc[d.id].label}` : p.bestRun]),
  ];
  return (
    <dl className="card mt-5 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-y-3 px-2 py-3 text-center">
      {stats.map(([n, l]) => <div key={l} className="flex flex-col-reverse justify-end px-1"><dt className="text-xs leading-tight text-muted">{l}</dt><dd className="text-lg font-semibold tabular-nums sm:text-2xl">{n}</dd></div>)}
    </dl>
  );
}

export const historyLabels = (t: Dict) => {
  const p = t.people;
  return {
    event: p.event, date: p.date, discipline: p.discipline, time: p.time, place: p.place, verifiedEvent: p.verifiedEvent,
    loadMore: p.loadMore, loadError: p.loadError, retry: p.retry, viewRounds: p.viewRounds, hideRounds: p.hideRounds, noRounds: p.noRounds, moreOptions: t.account.moreOptions,
  };
};

// Totales e historial del perfil público (KIN-627). Van aparte para que el nombre y el rating salgan sin esperar a los resultados (KIN-609 y KIN-611).
export async function RoperHistorySection({ id, lang, t }: { id: string; lang: Lang; t: Dict }) {
  const page = await getRoperHistory(id);
  const p = t.people;
  return (
    <>
      <RoperStats id={id} t={t} />

      <h2 className="mt-10 text-xl font-semibold">{p.history}</h2>
      {page.rows.length === 0 ? <p className="mt-3 text-muted">{p.noHistory}</p> : (
        <ProfileHistory roperId={id} lang={lang} initial={page.rows.map((r) => toHistoryItem(r, lang, t))} next={page.next} labels={historyLabels(t)} />
      )}
    </>
  );
}
