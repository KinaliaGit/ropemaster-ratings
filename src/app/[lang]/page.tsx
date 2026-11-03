import { events, ropers } from "@/lib/mock";
import { EventCard } from "@/components/EventCard";
import { RopeMasterPromo } from "@/components/RopeMasterPromo";
import { getDictionary, resolveLang } from "@/lib/i18n";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const open = events.filter((e) => e.status === "publicado").sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.status === "finalizado");
  const stats = [
    [open.length, t.home.openEvents],
    [events.reduce((n, e) => n + e.registered.length, 0), t.home.registered],
    [ropers.length, t.home.participants],
  ];
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">{t.home.title}</h1>
      <p className="mt-3 max-w-xl text-lg text-muted">{t.home.subtitle}</p>
      <dl className="mt-8 flex gap-8 border-y border-line py-5">
        {stats.map(([n, l]) => (
          <div key={l}><dd className="text-2xl font-semibold tabular-nums">{n}</dd><dt className="text-sm text-muted">{l}</dt></div>
        ))}
      </dl>

      <h2 className="mt-12 text-xl font-semibold">{t.home.upcoming}</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{open.map((e) => <EventCard key={e.id} e={e} lang={lang} t={t} />)}</div>
      {past.length > 0 && (<>
        <h2 className="mt-14 text-xl font-semibold">{t.home.finished}</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} lang={lang} t={t} />)}</div>
      </>)}
      <RopeMasterPromo lang={lang} t={t} />
    </div>
  );
}
