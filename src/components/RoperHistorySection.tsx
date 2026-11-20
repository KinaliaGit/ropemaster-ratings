import { ProfileHistory } from "@/components/ProfileHistory";
import { getRoperHistory, getRoperSummary } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { fmtTime } from "@/lib/people";
import { toHistoryItem } from "@/lib/results-view";
import type { Lang } from "@/lib/format";
import type { Dict } from "@/dictionaries/es";

// Totales, mejores tiempos e historial. Los usan el perfil público y "Mi cuenta" (KIN-627). Van aparte para que el nombre y el rating salgan sin esperar a los resultados (KIN-609 y KIN-611).
export async function RoperHistorySection({ id, lang, t }: { id: string; lang: Lang; t: Dict }) {
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

