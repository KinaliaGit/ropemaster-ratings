import { Suspense } from "react";
import { ropers, rankedIn, statOf, fmtRating, initials } from "@/lib/mock";
import { ParticipantList } from "@/components/ParticipantList";
import { DisciplineTabs } from "@/components/DisciplineTabs";
import { DEFAULT_DISCIPLINE, isActiveDiscipline } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Content({ props }: { props: PageProps<"/[lang]/participantes"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const sp = await props.searchParams;
  const d = isActiveDiscipline(sp.disciplina) ? sp.disciplina : DEFAULT_DISCIPLINE;
  // El ranking se calcula completo; el buscador solo filtra lo que se ve (cada quien conserva su lugar).
  const rows = rankedIn(ropers, d).map((r, i) => {
    const st = statOf(r, d)!;
    return {
      id: r.id, href: `/${lang}/participantes/${r.id}`, name: r.name, initials: initials(r.name), verified: r.verified, rank: i + 1,
      sub: `${st.events} ${t.plural.event(st.events)} · ${st.wins} ${t.plural.win(st.wins)}`, rating: fmtRating(st.rating),
    };
  });
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">{t.people.title}</h1>
      <p className="mt-3 text-lg text-muted">{t.people.subtitle}</p>
      <DisciplineTabs current={d} base="/participantes" lang={lang} t={t} />
      <ParticipantList rows={rows} initialQuery={typeof sp.q === "string" ? sp.q : ""} labels={{ search: t.people.search, noResults: t.people.noResults, verified: t.people.verified }} />
    </div>
  );
}

export default function Participantes(props: PageProps<"/[lang]/participantes">) {
  return <Suspense fallback={null}><Content props={props} /></Suspense>;
}
