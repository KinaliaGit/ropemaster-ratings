import { Suspense } from "react";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { EventForm } from "@/components/EventForm";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ params }: { params: PageProps<"/[lang]/organizador/eventos/nuevo">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const f = t.org.form;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/eventos/nuevo`}>
      {() => (
        <>
          <OrgNav lang={lang} t={t} />
          <div className="mx-auto max-w-2xl px-5 pb-10 pt-8">
            <h1 className="text-3xl font-semibold">{f.title}</h1>
            <p className="mt-1 text-sm text-muted">{f.blurb}</p>
            <EventForm
              labels={{ ...f, add: t.uploader.add, hint: t.uploader.hint, coverTag: t.uploader.cover }}
              disciplines={ACTIVE_DISCIPLINES.map((d) => ({ id: d.id, label: t.disc[d.id].label }))}
            />
          </div>
        </>
      )}
    </Gate>
  );
}

export default function NuevoEvento(props: PageProps<"/[lang]/organizador/eventos/nuevo">) {
  return <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">…</p>}><Page params={props.params} /></Suspense>;
}
