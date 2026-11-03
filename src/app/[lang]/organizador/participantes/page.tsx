import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { OrgParticipantsTable } from "@/components/OrgParticipantsTable";
import { ropers, statOf, fmtRating } from "@/lib/mock";
import { ACTIVE_DISCIPLINES, DEFAULT_DISCIPLINE } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ params }: { params: PageProps<"/[lang]/organizador/participantes">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const dir = t.org.dir;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/participantes`}>
      {() => (
        <>
          <OrgNav lang={lang} t={t} />
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
            <h1 className="text-3xl font-semibold">{dir.title}</h1>
            <p className="mt-1 text-sm text-muted">{dir.blurb}</p>
            <OrgParticipantsTable
              rows={[...ropers].sort((a, b) => (statOf(b)?.rating ?? 0) - (statOf(a)?.rating ?? 0)).map((r) => {
                const main = statOf(r, DEFAULT_DISCIPLINE);
                return {
                  id: r.id, href: `/${lang}/participantes/${r.id}`, name: r.name, phone: r.phone,
                  ratings: ACTIVE_DISCIPLINES.map((d) => (statOf(r, d.id) ? fmtRating(statOf(r, d.id)!.rating) : "–")),
                  events: main?.events ?? 0, wins: main?.wins ?? 0, profile: r.verified ? `${dir.verified} ✓` : dir.unclaimed,
                };
              })}
              l={{
                search: t.people.search, noResults: t.people.noResults, name: dir.name, phone: dir.phone, events: dir.events, wins: dir.wins, profile: dir.profile,
                ratingHeads: ACTIVE_DISCIPLINES.map((d) => `${dir.rating}${ACTIVE_DISCIPLINES.length > 1 ? ` · ${t.disc[d.id].label}` : ""}`),
              }}
            />
          </div>
        </>
      )}
    </Gate>
  );
}

export default function ParticipantesOrg(props: PageProps<"/[lang]/organizador/participantes">) {
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
