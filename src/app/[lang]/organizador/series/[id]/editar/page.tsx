import { BackLink } from "@/components/BackLink";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { SeriesForm } from "@/components/SeriesForm";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getOrganizerSeries } from "@/lib/data/series";
import { listArenas } from "@/lib/data/arenas";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/organizador/series/[id]/editar"> }) {
  const lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const f = t.org.series.form;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/series/${id}/editar`}>
      {async (s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        const [found, arenas] = await Promise.all([getOrganizerSeries(s.id, id), listArenas()]);
        if (!found) notFound();
        const { series: x, template: tpl } = found;
        return (
          <>
            <div className="page">
              <BackLink href={`/${lang}/organizador/series/${id}`}>{x.name}</BackLink>
              <h1 className="mt-2 text-3xl font-semibold">{f.editTitle}</h1>
              <p className="mt-1 text-sm text-muted">{f.editBlurb}</p>
              <SeriesForm
                lang={lang} error={typeof sp.error === "string" ? sp.error : undefined} labels={f} arenas={arenas} arenaLabels={t.org.arenas.picker}
                disciplines={ACTIVE_DISCIPLINES.map((d) => ({ id: d.id, label: t.disc[d.id].label }))}
                initial={{ slug: x.id, name: x.name, description: x.description, startDate: x.startDate, endDate: x.endDate, timezone: x.timezone, ...tpl }}
              />
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function EditarSerie(props: PageProps<"/[lang]/organizador/series/[id]/editar">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
