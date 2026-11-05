import { connection } from "next/server";
import { ParticipantList } from "@/components/ParticipantList";
import { listRanking } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { fmtRating, initials, publicAvatarUrl, statOf } from "@/lib/people";
import { getDictionary, resolveLang } from "@/lib/i18n";

export default async function Participantes({ params }: PageProps<"/[lang]/participantes">) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  // Una lista por modalidad activa; el cambio de pestaña y la búsqueda ocurren en el navegador.
  // El ranking llega completo y el buscador solo filtra lo visible (cada quien conserva su lugar).
  const sets = await Promise.all(ACTIVE_DISCIPLINES.map(async (d) => ({
    id: d.id,
    label: t.disc[d.id].persons,
    rows: (await listRanking(d.id)).map((r, i) => {
      const st = statOf(r, d.id)!;
      return {
        id: r.id, href: `/${lang}/participantes/${r.id}`, name: r.name, initials: initials(r.name), photo: publicAvatarUrl(r.avatarPath), rank: i + 1,
        sub: `${st.events} ${t.plural.event(st.events)} · ${st.wins} ${t.plural.win(st.wins)}`, rating: fmtRating(st.rating),
      };
    }),
  })));
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">{t.people.title}</h1>
      <p className="mt-3 text-lg text-muted">{t.people.subtitle}</p>
      <ParticipantList sets={sets} labels={{ search: t.people.search, noResults: t.people.noResults, empty: t.people.empty }} />
    </div>
  );
}
