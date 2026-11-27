import { BackLink } from "@/components/BackLink";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { SeriesForm } from "@/components/SeriesForm";
import { pickCapacityLabels } from "@/lib/capacity-labels";
import { listArenas } from "@/lib/data/arenas";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/organizador/series/nueva"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const f = t.org.series.form;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/series/nueva`}>
      {async (s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        const arenas = await listArenas();
        return (
          <>
            <div className="page">
              <BackLink href={`/${lang}/organizador?ver=series`}>{t.org.series.back}</BackLink>
              <h1 className="mt-2 text-3xl font-semibold">{f.newTitle}</h1>
              <p className="mt-1 text-sm text-muted">{f.newBlurb}</p>
              {sp.primero === "1" && <p role="status" data-testid="series-first" className="mt-4 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{f.firstSeries}</p>}
              <SeriesForm lang={lang} labels={{ ...f, errors: { ...t.org.form.errors, ...f.errors } }} capLabels={pickCapacityLabels(t.org.form)} arenas={arenas} arenaLabels={t.org.arenas.picker} />
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function NuevaSerie(props: PageProps<"/[lang]/organizador/series/nueva">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
