import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { AccountEventCard } from "@/components/AccountEventCard";
import { AvatarUploader } from "@/components/AvatarUploader";
import { fmtRating, initials, publicAvatarUrl } from "@/lib/people";
import { listMyRegistrations, listMyRemovals, listMyWaitlist } from "@/lib/data/registrations";
import { cancelRegistration, changeRegistrationRole, leaveWaitlist } from "@/lib/registration-actions";
import { hasEventPassed, isRegistrationOpen } from "@/lib/event-time";
import { mergeUpcoming } from "@/lib/upcoming";
import { RoperStats } from "@/components/RoperHistorySection";
import { PastEvents } from "@/components/PastEvents";
import { getPublicRoper } from "@/lib/data/ropers";
import { CopyId } from "@/components/CopyId";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { createMyRoperProfile, setMyRole } from "@/lib/profile-actions";
import { RoleFields } from "@/components/RoleFields";
import { RoleBadgeDialog } from "@/components/RoleBadgeDialog";
import { canChangeRole, roleText } from "@/lib/roles";
import { PayButton } from "@/components/PayButton";
import { fmtDeadline } from "@/lib/event-time";
import { STRIPE_ENABLED } from "@/lib/flags";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/mi-cuenta"> }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang = await resolveLang(props.params);
  const stripeOn = STRIPE_ENABLED && !!process.env.STRIPE_SECRET_KEY &&!!process.env.STRIPE_TEST_CONNECTED_ACCOUNT; // el pago en línea solo se ofrece si Stripe está configurado
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const notice = sp.yaVerificada === "1" ? t.account.alreadyVerified : sp.contrasena === "1" ? t.recovery.changed : sp.pago === "ok" ? t.pay.returned : sp.perfil === "ok" ? t.account.profileCreated : sp.rol === "ok" ? null : sp.rolInscripcion === "ok" ? t.account.roleChanged : sp.inscrito === "1" ? t.account.enrolledOk : sp.cancelado === "1" ? t.account.canceledOk : sp.espera === "1" ? t.account.waitlistJoined : sp.espera === "salio" ? t.account.waitlistLeft : typeof sp.error === "string" ? (t.enroll.errors as Record<string, string>)[sp.error] ?? t.enroll.errors.failed : null;
  return (
    <Gate lang={lang} role="any" next={`/${lang}/mi-cuenta`}>
      {async (s) => {
        if (!s.hasRoper) {
          // Cuenta sin perfil de lazador (p. ej. un organizador): se crea con un botón; reclama el que otro organizador haya registrado con su correo.
          return (
            <div className="mx-auto max-w-lg px-5 pb-10 pt-14">
              <h1 className="text-3xl font-semibold">{t.account.createTitle}</h1>
              <p className="mt-2 text-muted">{t.account.createText}</p>
              <form action={createMyRoperProfile} className="mt-6">
                <input type="hidden" name="lang" value={lang} />
                {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(t.enroll.errors as Record<string, string>)[sp.error] ?? t.enroll.errors.failed}</p>}
                <div className="mb-5 space-y-4"><RoleFields labels={t.roles} /></div>
                <button className="w-full rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{t.account.createBtn}</button>
              </form>
            </div>
          );
        }
        const [mine, removed, waiting, me] = await Promise.all([
          s.roperId ? listMyRegistrations(s.roperId) : [], s.roperId ? listMyRemovals(s.roperId) : [], listMyWaitlist(), s.roperId ? getPublicRoper(s.roperId) : Promise.resolve(null),
        ]);
        // KIN-627: las inscripciones se separan en próximas y pasadas (por fecha en la zona del evento); el total por pagar cuenta solo los de eventos próximos.
        const isPast = (m: (typeof mine)[number]) => !!m.event && (m.event.status === "finalizado" || hasEventPassed({ date: m.event.date ?? "", timezone: m.event.timezone }));
        const upcoming = mine.filter((m) => !isPast(m));
        const pastRegs = mine.filter(isPast);
        const unpaid = upcoming.filter((m) => m.paymentStatus === "pendiente");
        const unpaidCents = unpaid.reduce((n, m) => n + m.amountCents, 0);
        const modes = ACTIVE_DISCIPLINES.filter((d) => me?.stats[d.id]);
        // Etiqueta corta del rol para el encabezado: «Ambos · Cabecero» (el favorito sin decir «favorito»).
        const choice = s.roleChoice;
        const roleShort = choice?.role === "both" && choice.favorite ? `${t.roles.both} · ${t.roles[choice.favorite]}` : roleText(choice ?? null, t.roles);
        // KIN-770: una sola lista con lo que viene (pagadas, pendientes y en espera), por fecha.
        const next = mergeUpcoming(upcoming, waiting.filter((w) => w.event?.status === "publicado"));
        return (
          <div className="mx-auto max-w-3xl px-5 pb-10 pt-10">
            <div className="flex items-start gap-3 sm:gap-4">
              <AvatarUploader compact url={publicAvatarUrl(s.avatarPath)} initials={initials(s.name)} name={s.name} l={t.account.photo}
                badge={modes[0] && <span className="whitespace-nowrap rounded-full border-2 border-cream bg-brand px-2 text-xs font-semibold tabular-nums text-ink" aria-label={`${t.account.currentRating}: ${fmtRating(me!.stats[modes[0].id]!.rating)}`} role="img">{fmtRating(me!.stats[modes[0].id]!.rating)}</span>} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="min-w-0 break-words text-xl font-semibold leading-tight sm:text-3xl">{s.name}</h1>
                  {/* Solo cuando hay algo pendiente en los próximos eventos. */}
                  {unpaidCents > 0 && (
                    <p className="shrink-0 text-right leading-tight">
                      <span className="block text-lg font-semibold tabular-nums text-brand-hot sm:text-2xl">{mxn(unpaidCents / 100, lang).replace(" MXN", "")}</span>
                      <span className="text-xs text-muted">{t.account.pendingTotal}</span>
                    </p>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <RoleBadgeDialog action={setMyRole} lang={lang} initial={s.roleChoice ?? null} text={roleShort} l={{ fields: t.roles, title: t.account.roleTitle, save: t.account.roleSave, cancel: t.account.roleCancel, choose: t.account.roleChoose, edit: t.account.roleEdit }} />
                  {me?.shortId && <CopyId chip id={me.shortId} label={t.people.idLabel} copy={t.people.copyId} copied={t.people.idCopied} />}
                  {modes.slice(1).map((d) => <span key={d.id} className="inline-flex min-h-8 items-center rounded-full bg-sand px-3 text-sm tabular-nums">{t.disc[d.id].label} {fmtRating(me!.stats[d.id]!.rating)}</span>)}
                </div>
              </div>
            </div>

            <Suspense fallback={<div className="card mt-5 h-20 animate-pulse bg-sand/60" aria-hidden />}>
              <RoperStats id={s.roperId!} t={t} />
            </Suspense>

            {notice && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{notice}</p>}

            <h2 className="mt-8 text-xl font-semibold">{t.account.upcoming}</h2>
            <div className="mt-3 space-y-3">
              {next.length === 0 && (
                <div className="rounded-2xl bg-sand p-6 text-center">
                  <p className="text-muted">{t.account.noUpcoming}</p>
                  <Link href={`/${lang}`} className="mt-3 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{t.account.seeEvents}</Link>
                </div>
              )}
              {next.map((entry) => {
                const x = entry.item;
                const meta = [x.role ? t.roles[x.role as "header" | "heeler"] : "", x.category, x.event?.city ?? ""].filter(Boolean).join(" · ");
                const href = x.event?.slug ? `/${lang}/eventos/${x.event.slug}` : undefined;
                const pill = "inline-block rounded-full px-2.5 py-1 text-xs font-medium";
                if (entry.kind === "waitlist") {
                  const w = entry.item;
                  return (
                    <AccountEventCard key={`w-${w.id}`} testId="my-waitlist" date={w.event?.date} lang={lang} name={w.event?.name ?? "—"} href={href} meta={meta} menuLabel={t.account.moreOptions}
                      status={<span className={`${pill} bg-sand tabular-nums text-muted`}>{t.account.waitlistTitle} · {t.account.waitlistPlace(w.place)}</span>}
                      menu={
                        <>
                          <p className="text-muted">{t.account.waitlistHint}</p>
                          <form action={leaveWaitlist}>
                            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={w.id} />
                            <button className="min-h-11 rounded-full border border-line px-4 text-sm font-medium hover:border-ink">{t.account.waitlistLeave}</button>
                          </form>
                        </>
                      } />
                  );
                }
                const m = entry.item;
                const paid = m.paymentStatus === "pagado";
                const pending = m.paymentStatus === "pendiente";
                const canSwitch = s.roleChoice?.role === "both" && canChangeRole(m, mine) && !!m.event && m.event.status === "publicado" && isRegistrationOpen({ closesAt: m.event.closesAt, closed: m.event.registrationClosed });
                const closes = m.event?.closesAt ? `${Date.parse(m.event.closesAt) > Date.now() ? t.event.closesOn : t.org.ev.closesAtPast} ${fmtDeadline(m.event.closesAt, m.event.timezone, lang)}` : null;
                return (
                  <AccountEventCard key={m.id} date={m.event?.date} lang={lang} name={m.event?.name ?? "—"} href={href} meta={meta} menuLabel={t.account.moreOptions}
                    status={<span className={`${pill} ${paid ? "bg-emerald-50 text-emerald-800" : pending ? "bg-amber-50 text-amber-900" : "bg-sand text-muted"}`}>{paid ? `✓ ${t.account.paid}${m.paymentMethod ? ` · ${t.pay.method[m.paymentMethod as "efectivo" | "transferencia" | "stripe"]}` : ""}` : pending ? `${t.account.pending} · ${mxn(m.amountCents / 100, lang)}` : t.account.refunded}</span>}
                    menu={!paid || canSwitch || closes ? (
                      <>
                        {closes && <p className="text-muted">{closes}</p>}
                        {canSwitch && (
                          <form action={changeRegistrationRole} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={m.id} />
                            <label htmlFor={`role-${m.id}`} className="text-muted">{t.account.regRole}</label>
                            <select id={`role-${m.id}`} name="role" defaultValue={m.role ?? s.roleChoice?.favorite ?? "header"} className="min-h-11 rounded-xl border border-line bg-white px-3 text-sm">
                              <option value="header">{t.roles.header}</option><option value="heeler">{t.roles.heeler}</option>
                            </select>
                            <button className="min-h-11 rounded-full border border-line px-4 text-sm font-medium hover:border-ink">{t.account.changeRole}</button>
                          </form>
                        )}
                        {!paid && (
                          <form action={cancelRegistration}>
                            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={m.id} />
                            <button className="min-h-11 rounded-full border border-line px-4 text-sm font-medium text-red-700 hover:border-red-700">{t.account.cancel}</button>
                          </form>
                        )}
                      </>
                    ) : undefined}>
                    {pending && (
                      <details className="mt-2">
                        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border border-line px-4 text-sm font-medium hover:border-ink [&::-webkit-details-marker]:hidden">{t.pay.howTitle}</summary>
                        <div className="mt-2 rounded-xl bg-sand p-3 text-sm">
                          {stripeOn && <div className="mb-3 max-w-xs"><PayButton registrationId={m.id} lang={lang} label={`${t.pay.online} · ${mxn(m.amountCents / 100, lang)}`} busyLabel={t.pay.onlineBusy} errors={t.pay.errors} /><p className="mt-1.5 text-xs text-muted">{t.pay.onlineHint}</p></div>}
                          {stripeOn && <p className="text-muted">{t.pay.offlineHint}</p>}
                          {m.event?.paymentInfo ? <p className="whitespace-pre-line break-words">{m.event.paymentInfo}</p> : <p className="text-muted">{t.pay.noInstructions}</p>}
                        </div>
                      </details>
                    )}
                  </AccountEventCard>
                );
              })}
            </div>

            {removed.length > 0 && (
              <section aria-labelledby="removed" className="mt-10">
                <h2 id="removed" className="text-xl font-semibold">{t.account.removedTitle}</h2>
                <div className="mt-3 space-y-3">
                  {removed.map((x) => (
                    <AccountEventCard key={x.id} date={x.event?.event_date} lang={lang} name={x.event?.name ?? "—"} href={x.event?.slug ? `/${lang}/eventos/${x.event.slug}` : undefined}
                      meta={x.category} menuLabel={t.account.moreOptions}
                      status={<span className="inline-block rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">{t.account.removedOn} {fmtDate(x.removedAt.slice(0, 10), lang)}</span>}>
                      <p className="mt-2 break-words text-sm"><span className="font-medium">{t.account.removedReason}</span> <span className="whitespace-pre-line">{x.reason}</span></p>
                      {x.refundPending && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.account.removedRefund}</p>}
                      <p className="mt-1 text-xs text-muted">{x.canReenroll ? t.account.removedCanReturn : t.account.removedBlocked}</p>
                    </AccountEventCard>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="pasados" className="mt-10">
              <h2 id="pasados" className="text-xl font-semibold">{t.account.pastEvents}</h2>
              <Suspense fallback={<div className="card mt-3 h-24 animate-pulse bg-sand/60" aria-hidden />}>
                <PastEvents id={s.roperId!} registrations={pastRegs} lang={lang} t={t} />
              </Suspense>
            </section>
          </div>
        );
      }}
    </Gate>
  );
}

export default function MiCuenta(props: PageProps<"/[lang]/mi-cuenta">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
