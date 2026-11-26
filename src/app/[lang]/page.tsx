import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { listPublicEvents } from "@/lib/data/events";
import { EventCard } from "@/components/EventCard";
import { EventsSkeleton } from "@/components/ListSkeletons";
import { EventSearch } from "@/components/EventSearch";
import { matchesEvent, parseSearch } from "@/lib/search";
import { arenaKey, collectArenas, parseArenaParam } from "@/lib/arena";
import { RopeMasterPromo } from "@/components/RopeMasterPromo";
import { isLiveToday, statusByDate } from "@/lib/event-time";
import type { Lang } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Dict } from "@/dictionaries/es";

// Cifras y carteles: lo único que depende de la base. Va aparte para que el título salga al instante (KIN-611).
async function Events({ lang, t, searchParams }: { lang: Lang; t: Dict; searchParams: PageProps<"/[lang]">["searchParams"] }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const everything = await listPublicEvents();
  // KIN-751: filtro por arena (?arena=<llave>); las opciones salen de TODOS los eventos para poder cambiar de arena sin perderlas.
  // KIN-768: además, búsqueda por texto (?q=): nombre, arena, ciudad o fecha. Solo sobre eventos públicos.
  const params = await searchParams;
  const arena = parseArenaParam(params.arena);
  const query = parseSearch(params.q);
  const arenaOptions = collectArenas(everything.map((e) => e.venue));
  const all = everything.filter((e) => (!arena || arenaKey(e.venue) === arena) && matchesEvent(e, query));
  // KIN-656: "Próximos" solo con fecha de hoy o futura y el más cercano primero; los que ya pasaron se van solos a "Finalizados" (los más recientes primero).
  const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);
  const isOpen = (e: (typeof all)[number]) => statusByDate(e) === "publicado";
  // KIN-768: los de hoy salen aparte, en «En vivo», y ya no se mezclan con los próximos.
  const live = all.filter((e) => isLiveToday(e)).sort(byDate);
  const open = all.filter((e) => isOpen(e) && !isLiveToday(e)).sort(byDate);
  const past = all.filter((e) => !isOpen(e)).sort((a, b) => byDate(b, a));
  // Pestañas (?ver=vivo|proximos|finalizados). «En vivo» solo existe si hay eventos hoy y entonces se abre primero. Sin elegir y sin nada hoy:
  // próximos, salvo que no haya y sí finalizados (p. ej. al buscar un evento que ya pasó).
  const asked = params.ver === "vivo" || params.ver === "finalizados" || params.ver === "proximos" ? params.ver : "";
  const view = asked && (asked !== "vivo" || live.length > 0) ? asked : live.length > 0 ? "vivo" : open.length === 0 && past.length > 0 ? "finalizados" : "proximos";
  const shown = view === "vivo" ? live : view === "finalizados" ? past : open;
  const tabHref = (ver: string) => `/${lang}?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(arena ? { arena } : {}), ver })}`;
  const tabs = [...(live.length > 0 ? [["vivo", t.home.live, live.length] as const] : []), ["proximos", t.home.upcoming, open.length] as const, ["finalizados", t.home.finished, past.length] as const];
  return (
    <>
      <EventSearch action={`/${lang}`} query={query} arena={arena} view={asked} arenas={arenaOptions} labels={{ label: t.home.searchLabel, placeholder: t.home.searchPlaceholder, arena: t.org.arenas.filter.label, allArenas: t.org.arenas.filter.all, apply: t.home.searchBtn }} />
      {(query || arena) && (
        <p className="mt-2 text-sm text-muted">
          {[query ? `«${query}»` : "", arena ? arenaOptions.find((o) => o.key === arena)?.name ?? "" : ""].filter(Boolean).join(" · ")}{" "}
          <Link href={`/${lang}`} className="inline-block py-1.5 font-medium text-brand-hot hover:underline">{t.org.arenas.filter.clear}</Link>
        </p>
      )}
      <nav aria-label={t.home.title} className="mt-3 flex rounded-full bg-sand p-1 sm:max-w-sm">
        {tabs.map(([id, label, n]) => (
          <Link key={id} href={tabHref(id)} scroll={false} aria-current={view === id ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-1 py-2.5 text-[13px] transition sm:text-sm ${view === id ? "bg-white font-medium shadow-[0_1px_3px_rgba(20,19,17,0.12)]" : "text-muted hover:text-ink"}`}>{id === "vivo" && <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" />}{label} <span className="tabular-nums">{n}</span></Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-sand p-6 text-center text-muted">{query && all.length === 0 ? t.home.searchEmpty(query) : arena && all.length === 0 ? t.org.arenas.filter.empty : everything.length === 0 ? t.home.empty : t.home.tabEmpty}</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4">{shown.map((e, i) => <EventCard key={e.id} e={e} lang={lang} t={t} eager={i < 4} />)}</div>
      )}
      <RopeMasterPromo lang={lang} t={t} />
    </>
  );
}

export default async function Home({ params, searchParams }: PageProps<"/[lang]">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  return (
    <div className="page">
      <h1 className="text-2xl font-semibold sm:text-3xl">{t.home.title}</h1>
      <Suspense fallback={<EventsSkeleton />}>
        <Events lang={lang} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
