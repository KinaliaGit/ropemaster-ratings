import { ropers, rankedIn, statOf, fmtRating, initials } from "@/lib/mock";
import { ParticipantList } from "@/components/ParticipantList";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

export default async function Participantes({ params }: PageProps<"/[lang]/participantes">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  // Una lista por modalidad activa; el cambio de pestaña y la búsqueda ocurren en el navegador.
  // El ranking se calcula completo y el buscador solo filtra lo visible (cada quien conserva su lugar).
  const sets = ACTIVE_DISCIPLINES.map((d) => ({
    id: d.id,
    label: t.disc[d.id].persons,
    rows: rankedIn(ropers, d.id).map((r, i) => {
      const st = statOf(r, d.id)!;
      return {
        id: r.id, href: `/${lang}/participantes/${r.id}`, name: r.name, initials: initials(r.name), verified: r.verified, rank: i + 1,
        sub: `${st.events} ${t.plural.event(st.events)} · ${st.wins} ${t.plural.win(st.wins)}`, rating: fmtRating(st.rating),
      };
    }),
  }));
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">{t.people.title}</h1>
      <p className="mt-3 text-lg text-muted">{t.people.subtitle}</p>
      <ParticipantList sets={sets} labels={{ search: t.people.search, noResults: t.people.noResults, verified: t.people.verified }} />
    </div>
  );
}
