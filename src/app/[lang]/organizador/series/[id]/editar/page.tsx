import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { SeriesForm } from "@/components/SeriesForm";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getOrganizerSeries } from "@/lib/data/series";
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
        const found = await getOrganizerSeries(s.id, id);
        if (!found) notFound();
        const { series: x, template: tpl } = found;
        return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-2xl px-5 pb-10 pt-8">
              <Link href={`/${lang}/organizador/series/${id}`} className="text-sm text-muted hover:text-ink">← {x.name}</Link>
              <h1 className="mt-2 text-3xl font-semibold">{f.editTitle}</h1>
              <p className="mt-1 text-sm text-muted">{f.editBlurb}</p>
              <SeriesForm
                lang={lang} error={typeof sp.error === "string" ? sp.error : undefined} labels={f}
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
