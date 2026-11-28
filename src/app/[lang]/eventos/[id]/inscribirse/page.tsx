import { BackLink } from "@/components/BackLink";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { notFound, redirect } from "next/navigation";
import { getPublicEvent } from "@/lib/data/events";
import { listMyRegistrations, listMyWaitlist } from "@/lib/data/registrations";
import { mxn, type Lang } from "@/lib/format";
import { fmtDeadline, isNotOpenYet, isRegistrationOpen, statusByDate } from "@/lib/event-time";
import { Gate } from "@/components/Gate";
import { EnrollRoleAndPackages } from "@/components/EnrollRoleAndPackages";
import { enroll, joinWaitlist } from "@/lib/registration-actions";
import { STRIPE_ENABLED } from "@/lib/flags";
import { isFull } from "@/lib/event-capacity";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Resolver({ props }: { props: PageProps<"/[lang]/eventos/[id]/inscribirse"> }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang: Lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const e = await getPublicEvent(id);
  if (!e) notFound();
  const regOpen = statusByDate(e) === "publicado" && isRegistrationOpen({ opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed }); // fecha pasada = cerrado (KIN-656)
  const full = isFull(e.enrolled, e.capacity); // KIN-726: con el cupo lleno el mismo formulario entra a la lista de espera (la base lo vuelve a comprobar)
  const notYet = !e.registrationClosed && isNotOpenYet({ opensAt: e.registrationOpensAt });
  return (
    <Gate lang={lang} role="any" next={`/${lang}/eventos/${id}/inscribirse`}>
      {async (s) => {
        // Quien ya está inscrito (o en la lista de espera) de este evento no vuelve a inscribirse: se le lleva a la página del evento, donde ve su rol y puede cambiarlo.
        if (s.roperId && e.uuid) {
          const [mine, waiting] = await Promise.all([listMyRegistrations(s.roperId), listMyWaitlist()]);
          if (mine.some((r) => r.event?.uuid === e.uuid) || waiting.some((w) => w.event?.slug === e.id)) redirect(`/${lang}/eventos/${e.id}`);
        }
        // KIN-793: en Lazada Sorteada TODOS eligen su rol y sus paquetes juntos, sea cual sea el rol de su perfil (viene marcado el del perfil, o el
        // favorito si es "Ambos"): con un solo rol, un número de paquetes; con "los dos", los paquetes de cada lado por separado.
        const pickRoleAndPackages = e.drawType === "lazada_sorteada";
        const profileRole = s.roleChoice?.role ?? null;
        const markedRole = profileRole === "both" ? (s.roleChoice?.favorite ?? null) : profileRole;
        return (
        <div className="page">
          <BackLink href={`/${lang}/eventos/${e.id}`}>{e.name}</BackLink>
          <h1 className="mt-3 text-3xl font-semibold">{t.enroll.title}</h1>
          {regOpen && e.registrationClosesAt && <p className="mt-2 text-sm text-muted">{t.event.closesOn} {fmtDeadline(e.registrationClosesAt, e.timezone, lang)}</p>}
          {!regOpen && <p role="alert" className="mt-4 rounded-xl bg-sand p-3 text-sm font-medium">{notYet && e.registrationOpensAt ? `${t.enroll.errors.not_open_yet} ${t.event.opensOn} ${fmtDeadline(e.registrationOpensAt, e.timezone, lang)}` : t.enroll.errors.registration_closed}</p>}
          {typeof sp.error === "string" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(t.enroll.errors as Record<string, string>)[sp.error] ?? t.enroll.errors.failed}</p>}
          {regOpen && full && <div role="note" className="mt-4 rounded-xl bg-sand p-3 text-sm" data-testid="waitlist-note"><p className="font-medium">{t.enroll.fullTitle}</p><p className="mt-1 text-muted">{t.enroll.fullNote}</p></div>}
          {regOpen && <form action={full ? joinWaitlist : enroll} className="card mt-6 space-y-5 p-6">
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="event" value={e.id} />
            <fieldset>
              <legend className="text-sm font-medium">{t.enroll.category}</legend>
              {e.categories.map((c, i) => (
                <label key={c.name} className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-line p-3 has-checked:border-ink has-checked:bg-sand">
                  <span><input type="radio" name="category" value={c.id} defaultChecked={i === 0} className="mr-2 accent-brand" />{c.name}</span>
                  <span className="text-sm tabular-nums">{mxn(c.fee, lang)}</span>
                </label>
              ))}
            </fieldset>
            {pickRoleAndPackages && (
              <EnrollRoleAndPackages lang={lang} categories={e.categories.map((c) => ({ id: c.id, fee: c.fee }))} shotsPerPackage={e.lazadaShotsPerPackage} defaultRole={markedRole ?? "header"} markedRole={markedRole}
                labels={{
                  roleTitle: t.enroll.roleTitleAny, roleHint: t.enroll.roleHintAny, header: t.roles.header, heeler: t.roles.heeler, both: t.enroll.both, marked: profileRole === "both" ? t.roles.favorite : t.enroll.yourRole,
                  packages: t.enroll.packages, packagesHint: t.enroll.packagesHint, packagesHeader: t.enroll.packagesHeader, packagesHeeler: t.enroll.packagesHeeler, sidesHint: t.enroll.packagesSidesHint, needOne: t.enroll.errors.packages_side,
                  total: t.enroll.packagesTotal, package: t.people.packageOne, packagesWord: t.people.packageMany, shot: t.people.shotOne, shots: t.people.shotMany,
                }} />
            )}
            {s.roleChoice?.role === "both" && !pickRoleAndPackages && (
              <fieldset>
                <legend className="text-sm font-medium">{t.enroll.roleTitle}</legend>
                {(["header", "heeler", "both"] as const).map((r) => (
                  <label key={r} className="mt-2 flex cursor-pointer items-center rounded-xl border border-line p-3 has-checked:border-ink has-checked:bg-sand">
                    <input type="radio" name="role" value={r} required defaultChecked={r === (s.roleChoice?.favorite ?? "header")} className="mr-2 accent-brand" />
                    {r === "both" ? t.enroll.both : t.roles[r]}
                    {r === s.roleChoice?.favorite && <span className="ml-2 text-xs text-muted">({t.roles.favorite})</span>}
                  </label>
                ))}
                <p className="mt-2 text-xs text-muted">{t.enroll.roleHint}</p>
              </fieldset>
            )}
            {e.drawType === "lazada_sorteada" && !pickRoleAndPackages && (
              <label className="block text-sm font-medium">{t.enroll.packages}
                <input name="packages" type="number" required min={1} max={99} step={1} defaultValue={1} inputMode="numeric" className="mt-1 w-28 rounded-xl border border-line bg-white px-3 py-2 tabular-nums outline-none focus:border-ink" />
                <span className="mt-1 block text-xs font-normal text-muted">{t.enroll.packagesHint.replace("{shots}", e.lazadaShotsPerPackage === null ? "—" : String(e.lazadaShotsPerPackage))}</span>
              </label>
            )}
            {e.maxRoperRating !== null && <p className="text-xs text-muted">{t.event.maxRating}: <span className="tabular-nums">{e.maxRoperRating.toFixed(1)}</span></p>}
            <button className="w-full rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hot">{full ? t.enroll.joinWaitlist : t.enroll.submit}</button>
            {!full && <p className="text-center text-xs text-muted">{STRIPE_ENABLED ? t.enroll.pendingNote : t.enroll.pendingNoteOffline}</p>}
          </form>}
        </div>
        );
      }}
    </Gate>
  );
}

export default function Inscribirse(props: PageProps<"/[lang]/eventos/[id]/inscribirse">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Resolver props={props} />
    </Suspense>
  );
}
