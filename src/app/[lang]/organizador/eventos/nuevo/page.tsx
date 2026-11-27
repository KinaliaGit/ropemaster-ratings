import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { EventForm } from "@/components/EventForm";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { listArenas } from "@/lib/data/arenas";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/organizador/eventos/nuevo"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const f = t.org.form;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/eventos/nuevo`}>
      {async (s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        const arenas = await listArenas();
        return (
        <>
          <div className="page">
            <h1 className="text-3xl font-semibold">{f.title}</h1>
            <p className="mt-1 text-sm text-muted">{f.blurb}</p>
            <p className="mt-1 text-sm text-muted" data-testid="new-event-series-hint">{f.seriesHint} <Link href={`/${lang}/organizador/series/nueva`} className="font-medium text-brand-hot hover:underline">{f.seriesLink}</Link></p>
            <EventForm
              lang={lang}
              labels={f} arenas={arenas} arenaLabels={t.org.arenas.picker}
              disciplines={ACTIVE_DISCIPLINES.map((d) => ({ id: d.id, label: t.disc[d.id].label }))}
            />
          </div>
        </>
      );}}
    </Gate>
  );
}

export default function NuevoEvento(props: PageProps<"/[lang]/organizador/eventos/nuevo">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
