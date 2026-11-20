import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { SeriesForm } from "@/components/SeriesForm";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/organizador/series/nueva"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const f = t.org.series.form;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/series/nueva`}>
      {(s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-2xl px-5 pb-10 pt-8">
              <Link href={`/${lang}/organizador/series`} className="text-sm text-muted hover:text-ink">← {t.org.series.back}</Link>
              <h1 className="mt-2 text-3xl font-semibold">{f.newTitle}</h1>
              <p className="mt-1 text-sm text-muted">{f.newBlurb}</p>
              {sp.primero === "1" && <p role="status" data-testid="series-first" className="mt-4 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{f.firstSeries}</p>}
              <SeriesForm lang={lang} error={typeof sp.error === "string" ? sp.error : undefined} labels={f} disciplines={ACTIVE_DISCIPLINES.map((d) => ({ id: d.id, label: t.disc[d.id].label }))} />
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
