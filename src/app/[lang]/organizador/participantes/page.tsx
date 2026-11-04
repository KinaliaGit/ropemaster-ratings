import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ params }: { params: PageProps<"/[lang]/organizador/participantes">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const dir = t.org.dir;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/participantes`}>
      {(s) => (
        <>
          <OrgNav lang={lang} t={t} />
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
            <h1 className="text-3xl font-semibold">{dir.title}</h1>
            <p className="mt-1 text-sm text-muted">{dir.blurb}</p>
            {/* Sin verificar no se ve el directorio (la base tampoco lo permite). TODO: tabla real con roper_contacts. */}
            {!s.verified
              ? <div role="note" className="mt-6 rounded-2xl border border-line bg-sand p-4 text-sm"><p className="font-semibold">{t.org.verify.title}</p><p className="mt-1 text-muted">{t.org.verify.text}</p></div>
              : <p className="mt-6 rounded-2xl bg-sand p-6 text-center text-muted">{t.org.noParticipants}</p>}
          </div>
        </>
      )}
    </Gate>
  );
}

export default function ParticipantesOrg(props: PageProps<"/[lang]/organizador/participantes">) {
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
