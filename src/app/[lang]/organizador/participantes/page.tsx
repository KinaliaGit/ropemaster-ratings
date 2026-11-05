import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { OrgParticipantsTable } from "@/components/OrgParticipantsTable";
import { AddParticipantForm } from "@/components/AddParticipantForm";
import { listDirectory } from "@/lib/data/directory";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ params }: { params: PageProps<"/[lang]/organizador/participantes">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const d = t.org.dir;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/participantes`}>
      {async (s) => {
        // Solo organizadores verificados (o admin) ven celulares; la base devuelve vacío a cualquier otro.
        const canSee = s.verified || s.isAdmin;
        const rows = canSee ? await listDirectory(lang, { verified: d.verified, unclaimed: d.unclaimed }) : [];
        return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
              <h1 className="text-3xl font-semibold">{d.title}</h1>
              <p className="mt-1 text-sm text-muted">{d.blurb}</p>
              {!canSee
                ? <div role="note" className="mt-6 rounded-2xl border border-line bg-sand p-4 text-sm"><p className="font-semibold">{t.org.verify.title}</p><p className="mt-1 text-muted">{t.org.verify.text}</p></div>
                : <>
                    <AddParticipantForm l={{ title: d.addTitle, blurb: d.addBlurb, name: d.addName, phone: d.addPhone, phoneHint: d.addPhoneHint, consent: d.addConsent, btn: d.addBtn, added: d.added, duplicateTitle: d.duplicateTitle, duplicateHint: d.duplicateHint, createAnyway: d.createAnyway, errors: d.errors }} />
                    {rows.length === 0
                      ? <p className="mt-6 rounded-2xl bg-sand p-6 text-center text-muted">{d.empty}</p>
                      : <OrgParticipantsTable rows={rows} l={{ search: t.people.search, noResults: t.people.noResults, name: d.name, phone: d.phone, ratingHeads: ACTIVE_DISCIPLINES.map((x) => t.disc[x.id].label), events: d.events, wins: d.wins, profile: d.profile }} />}
                  </>}
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function ParticipantesOrg(props: PageProps<"/[lang]/organizador/participantes">) {
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
