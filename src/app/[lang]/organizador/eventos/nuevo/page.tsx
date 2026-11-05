import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { EventForm } from "@/components/EventForm";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/organizador/eventos/nuevo"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const f = t.org.form;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/eventos/nuevo`}>
      {(s) => (
        <>
          <OrgNav lang={lang} t={t} admin={s.isAdmin} />
          <div className="mx-auto max-w-2xl px-5 pb-10 pt-8">
            <h1 className="text-3xl font-semibold">{f.title}</h1>
            <p className="mt-1 text-sm text-muted">{f.blurb}</p>
            <EventForm
              lang={lang} error={sp.error === "1"}
              labels={f}
              disciplines={ACTIVE_DISCIPLINES.map((d) => ({ id: d.id, label: t.disc[d.id].label }))}
            />
          </div>
        </>
      )}
    </Gate>
  );
}

export default function NuevoEvento(props: PageProps<"/[lang]/organizador/eventos/nuevo">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
