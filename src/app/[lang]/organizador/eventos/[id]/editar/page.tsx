import { isoToZonedLocal } from "@/lib/event-time";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { EventForm } from "@/components/EventForm";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getOrganizerEvent } from "@/lib/data/events";
import { listArenas } from "@/lib/data/arenas";
import { getPaymentInstructions } from "@/lib/data/registrations";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/organizador/eventos/[id]/editar"> }) {
  const lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const f = t.org.form;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/eventos/${id}/editar`}>
      {async (s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        const e = await getOrganizerEvent(s.id, id);
        if (!e) notFound();
        if (e.status === "finalizado") redirect(`/${lang}/organizador/eventos/${id}`);
        const [paymentInfo, arenas] = await Promise.all([getPaymentInstructions(e.uuid!), listArenas()]);
        return (
          <>
            <div className="mx-auto max-w-2xl px-5 pb-10 pt-8">
              <Link href={`/${lang}/organizador/eventos/${id}`} className="text-sm text-muted hover:text-ink">← {e.name}</Link>
              <h1 className="mt-2 text-3xl font-semibold">{f.editTitle}</h1>
              <p className="mt-1 text-sm text-muted">{f.editBlurb}</p>
              <EventForm
                lang={lang} error={typeof sp.error === "string" ? sp.error : undefined} labels={f} arenas={arenas} arenaLabels={t.org.arenas.picker}
                disciplines={ACTIVE_DISCIPLINES.map((d) => ({ id: d.id, label: t.disc[d.id].label }))}
                initial={{ arenaId: e.arenaId, slug: e.id, name: e.name, date: e.date, capacity: e.capacity, venue: e.venue, city: e.city, description: e.description, paymentInfo, opensAt: e.registrationOpensAt ? isoToZonedLocal(e.registrationOpensAt, e.timezone) : "", closesAt: e.registrationClosesAt ? isoToZonedLocal(e.registrationClosesAt, e.timezone) : "", timezone: e.timezone, maxRoperRating: e.maxRoperRating, drawType: e.drawType, shotsPerPackage: e.lazadaShotsPerPackage, maxTeamRating: e.maxTeamRating, rounds: e.rounds, drawLocked: e.enrolled > 0, disciplines: e.disciplines, cats: e.categories.map((c) => ({ id: c.id, name: c.name, fee: c.fee })) }}
              />
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function EditarEvento(props: PageProps<"/[lang]/organizador/eventos/[id]/editar">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
