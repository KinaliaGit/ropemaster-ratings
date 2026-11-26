import { connection } from "next/server";
import { Suspense } from "react";
import { RoperGrid } from "@/components/RoperGrid";
import { RankingSkeleton } from "@/components/ListSkeletons";
import { listDirectoryPage } from "@/lib/data/ropers";
import { DEFAULT_DISCIPLINE } from "@/lib/disciplines";
import type { Lang } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Dict } from "@/dictionaries/es";

// Buscador, filtros y primera tanda del directorio: lo único que depende de la base. Va aparte para que el título salga al instante (KIN-611).
async function Directory({ lang, t }: { lang: Lang; t: Dict }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  // Si la primera lectura falla, la pantalla sale igual y ofrece reintentar.
  const initial = await listDirectoryPage({ discipline: DEFAULT_DISCIPLINE, search: "", role: null, offset: 0 }).catch(() => null);
  const p = t.people;
  return (
    <RoperGrid
      discipline={DEFAULT_DISCIPLINE} lang={lang} initial={initial}
      labels={{
        search: p.search, noResults: p.noMatches, loadMore: p.loadMore, loadError: p.loadError, retry: p.retry, rating: p.rating, position: p.position,
        all: p.allRopers, headers: p.headers, heelers: p.heelers, header: t.roles.header, heeler: t.roles.heeler, both: t.roles.both,
      }}
    />
  );
}

export default async function Participantes({ params }: PageProps<"/[lang]/participantes">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  return (
    <div className="page">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t.people.title}</h1>
      <Suspense fallback={<RankingSkeleton />}>
        <Directory lang={lang} t={t} />
      </Suspense>
    </div>
  );
}
