import { connection } from "next/server";
import { Suspense } from "react";
import { ParticipantList } from "@/components/ParticipantList";
import { RankingSkeleton } from "@/components/ListSkeletons";
import { listRankingPage } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import type { Lang } from "@/lib/format";
import { toParticipantRow } from "@/lib/ranking-view";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Dict } from "@/dictionaries/es";

// Buscador y primera página del ranking: lo único que depende de la base. Va aparte para que el título salga al instante (KIN-611).
async function Ranking({ lang, t }: { lang: Lang; t: Dict }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  // Una lista por modalidad activa, solo con su primera página (KIN-613). "Ver más" y la búsqueda piden el resto al servidor (/api/ranking),
  // que ordena y numera todo el ranking: cada quien conserva su lugar real.
  const sets = await Promise.all(ACTIVE_DISCIPLINES.map(async (d) => {
    const page = await listRankingPage(d.id);
    return { id: d.id, label: t.disc[d.id].persons, rows: page.rows.map((r) => toParticipantRow(r, lang, t)), next: page.next };
  }));
  return (
    <ParticipantList
      sets={sets} lang={lang}
      labels={{ search: t.people.search, noResults: t.people.noResults, empty: t.people.empty, loadMore: t.people.loadMore, loadError: t.people.loadError, retry: t.people.retry }}
    />
  );
}

export default async function Participantes({ params }: PageProps<"/[lang]/participantes">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">{t.people.title}</h1>
      <p className="mt-3 text-lg text-muted">{t.people.subtitle}</p>
      <Suspense fallback={<RankingSkeleton />}>
        <Ranking lang={lang} t={t} />
      </Suspense>
    </div>
  );
}
