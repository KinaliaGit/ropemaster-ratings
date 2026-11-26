import { getEventResults } from "@/lib/data/event-results";
import { toResultItem } from "@/lib/event-results-view";
import { EventResults } from "@/components/EventResults";
import type { DisciplineId } from "@/lib/disciplines";
import type { Lang } from "@/lib/format";
import type { Dict } from "@/dictionaries/es";

// Resultados del evento. Los usan la página pública del evento y el panel del organizador (KIN-628): así la tabla es SIEMPRE la misma (solo de eventos finalizados): primera página de cada modalidad; el resto se pide con "Ver más" (KIN-608).
export async function EventResultsSection({ slug, uuid, disciplines, lang, t }: { slug: string; uuid: string; disciplines: DisciplineId[]; lang: Lang; t: Dict }) {
  const sets = (await Promise.all(disciplines.map(async (d) => {
    const page = await getEventResults(uuid, d);
    return { id: d, label: t.disc[d].label, rows: page.rows.map((r) => toResultItem(r, lang, t)), next: page.next, total: page.total };
  }))).filter((s) => s.rows.length > 0);
  if (sets.length === 0) return <p className="mt-3 text-muted">{t.event.noResults}</p>;
  return (
    <EventResults
      slug={slug} lang={lang} sets={sets}
      labels={{ loadMore: t.people.loadMore, loadError: t.people.loadError, retry: t.people.retry, viewRounds: t.people.viewRounds, hideRounds: t.people.hideRounds, noRounds: t.people.noRounds, results: t.event.results, findRoper: t.event.findRoper, showAll: t.event.showAll, noRoper: t.event.noRoper }}
    />
  );
}

