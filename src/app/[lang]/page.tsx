import { connection } from "next/server";
import { Suspense } from "react";
import { listPublicEvents } from "@/lib/data/events";
import { EventCard } from "@/components/EventCard";
import { EventsSkeleton } from "@/components/ListSkeletons";
import { ArenaFilter } from "@/components/ArenaFilter";
import { arenaKey, collectArenas, parseArenaParam } from "@/lib/arena";
import { RopeMasterPromo } from "@/components/RopeMasterPromo";
import { statusByDate } from "@/lib/event-time";
import type { Lang } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Dict } from "@/dictionaries/es";

// Cifras y carteles: lo único que depende de la base. Va aparte para que el título salga al instante (KIN-611).
async function Events({ lang, t, searchParams }: { lang: Lang; t: Dict; searchParams: PageProps<"/[lang]">["searchParams"] }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const everything = await listPublicEvents();
  // KIN-751: filtro por arena (?arena=<llave>); las opciones salen de TODOS los eventos para poder cambiar de arena sin perderlas.
  const arena = parseArenaParam((await searchParams).arena);
  const arenaOptions = collectArenas(everything.map((e) => e.venue));
  const all = arena ? everything.filter((e) => arenaKey(e.venue) === arena) : everything;
  // KIN-656: "Próximos" solo con fecha de hoy o futura y el más cercano primero; los que ya pasaron se van solos a "Finalizados" (los más recientes primero).
  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  const isOpen = (e: (typeof all)[number]) => statusByDate(e) === "publicado";
  const open = all.filter(isOpen).sort(byDate);
  const past = all.filter((e) => !isOpen(e)).sort((a, b) => byDate(b, a));
  return (
    <>
      <ArenaFilter action={`/${lang}`} options={arenaOptions} selected={arena} labels={t.org.arenas.filter} className="mt-8" />
      <dl className="mt-8 flex gap-8 border-y border-line py-5">
        {[[open.length, t.home.openEvents], [past.length, t.home.finished.toLowerCase()]].map(([n, l]) => (
          <div key={l}><dd className="text-2xl font-semibold tabular-nums">{n}</dd><dt className="text-sm text-muted">{l}</dt></div>
        ))}
      </dl>

      {all.length === 0 && <p className="mt-12 rounded-2xl bg-sand p-6 text-center text-muted">{arena ? t.org.arenas.filter.empty : t.home.empty}</p>}
      {open.length > 0 && (<>
        <h2 className="mt-12 text-xl font-semibold">{t.home.upcoming}</h2>
        <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{open.map((e, i) => <EventCard key={e.id} e={e} lang={lang} t={t} eager={i < 4} />)}</div>
      </>)}
      {past.length > 0 && (<>
        <h2 className="mt-14 text-xl font-semibold">{t.home.finished}</h2>
        <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{past.map((e) => <EventCard key={e.id} e={e} lang={lang} t={t} />)}</div>
      </>)}
      <RopeMasterPromo lang={lang} t={t} />
    </>
  );
}

export default async function Home({ params, searchParams }: PageProps<"/[lang]">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">{t.home.title}</h1>
      <p className="mt-3 max-w-xl text-lg text-muted">{t.home.subtitle}</p>
      <Suspense fallback={<EventsSkeleton />}>
        <Events lang={lang} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
