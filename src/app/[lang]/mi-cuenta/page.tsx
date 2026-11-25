import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { AvatarUploader } from "@/components/AvatarUploader";
import { EventCard } from "@/components/EventCard";
import { RoperCard } from "@/components/RoperCard";
import { fmtRating, initials, publicAvatarUrl } from "@/lib/people";
import { listRankingPage } from "@/lib/data/ropers";
import { rankedToRoper } from "@/lib/ranking";
import { listMyRegistrations, listMyRemovals, listMyWaitlist } from "@/lib/data/registrations";
import { cancelRegistration, changeRegistrationRole, leaveWaitlist } from "@/lib/registration-actions";
import { hasEventPassed, isRegistrationOpen, statusByDate } from "@/lib/event-time";
import { RatingEvolution } from "@/components/RatingEvolution";
import { RoperHistorySection } from "@/components/RoperHistorySection";
import { HistorySkeleton } from "@/components/ProfileSkeleton";
import { getPublicRoper } from "@/lib/data/ropers";
import { CopyId } from "@/components/CopyId";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { createMyRoperProfile, setMyRole } from "@/lib/profile-actions";
import { RoleFields } from "@/components/RoleFields";
import { RoleBadgeDialog } from "@/components/RoleBadgeDialog";
import { roleText } from "@/lib/roles";
import { PayButton } from "@/components/PayButton";
import { listPublicEvents } from "@/lib/data/events";
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
  const [events, top] = await Promise.all([listPublicEvents(), listRankingPage("lazo").then((p) => p.rows.slice(0, 4).map((r) => rankedToRoper(r, "lazo")))]);
  const notice = sp.yaVerificada === "1" ? t.account.alreadyVerified : sp.pago === "ok" ? t.pay.returned : sp.perfil === "ok" ? t.account.profileCreated : sp.rol === "ok" ? null : sp.rolInscripcion === "ok" ? t.account.roleChanged : sp.inscrito === "1" ? t.account.enrolledOk : sp.cancelado === "1" ? t.account.canceledOk : sp.espera === "1" ? t.account.waitlistJoined : sp.espera === "salio" ? t.account.waitlistLeft : typeof sp.error === "string" ? (t.enroll.errors as Record<string, string>)[sp.error] ?? t.enroll.errors.failed : null;
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
        const [mine, removed, waiting, me] = await Promise.all([listMyRegistrations(), listMyRemovals(), listMyWaitlist(), s.roperId ? getPublicRoper(s.roperId) : Promise.resolve(null)]);
        // KIN-627: las inscripciones se separan en próximas y pasadas (por fecha en la zona del evento); los pagos pendientes son solo los de eventos próximos.
        const isPast = (m: (typeof mine)[number]) => !!m.event && (m.event.status === "finalizado" || hasEventPassed({ date: m.event.date ?? "", timezone: m.event.timezone }));
        const upcoming = mine.filter((m) => !isPast(m));
        const pastRegs = mine.filter(isPast);
        const unpaid = upcoming.filter((m) => m.paymentStatus !== "pagado" && m.paymentStatus !== "reembolsado");
        const unpaidCents = unpaid.reduce((n, m) => n + m.amountCents, 0);
        const modes = ACTIVE_DISCIPLINES.filter((d) => me?.stats[d.id]);
        const mineSlugs = new Set(mine.map((m) => m.event?.slug));
        const blockedSlugs = new Set(removed.filter((x) => !x.canReenroll).map((x) => x.event?.slug)); // sacado y sin permiso para volver
        const available = events.filter((e) => statusByDate(e) === "publicado" && !mineSlugs.has(e.id) && !blockedSlugs.has(e.id));
        return (
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-10">
            <div className="flex flex-wrap items-center gap-5">
              <AvatarUploader url={publicAvatarUrl(s.avatarPath)} initials={initials(s.name)} name={s.name} l={t.account.photo} />
              <div className="flex-1">
                <p className="label">{s.role === "organizador" ? t.account.typeOrganizer : t.account.type}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="min-w-0 break-words text-3xl font-semibold">{s.name}</h1>
                  <RoleBadgeDialog action={setMyRole} lang={lang} initial={s.roleChoice ?? null} text={roleText(s.roleChoice ?? null, t.roles)} l={{ fields: t.roles, title: t.account.roleTitle, save: t.account.roleSave, cancel: t.account.roleCancel, choose: t.account.roleChoose, edit: t.account.roleEdit }} />
                </div>
                {me?.shortId && <CopyId id={me.shortId} label={t.people.idLabel} copy={t.people.copyId} copied={t.people.idCopied} />}
              </div>
            </div>

            {notice && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{notice}</p>}
            {modes.length > 0 && (
              <dl className="mt-6 flex flex-wrap gap-8" aria-label={t.account.currentRating}>
                {modes.map((d) => (
                  <div key={d.id}><dd className="text-4xl font-semibold tabular-nums">{fmtRating(me!.stats[d.id]!.rating)}<span className="text-lg text-muted">/10</span></dd><dt className="label mt-1">{t.account.currentRating}{modes.length > 1 ? ` · ${t.disc[d.id].label}` : ""}</dt></div>
                ))}
              </dl>
            )}

            <Suspense fallback={null}>
              <RatingEvolution id={s.roperId!} lang={lang} t={t} />
            </Suspense>

            <section aria-labelledby="pendientes" className="mt-10">
              <h2 id="pendientes" className="text-xl font-semibold">{t.account.pendingPayments}</h2>
              {unpaid.length === 0 ? <p className="mt-3 text-muted">{t.account.noPending}</p> : (
                <div className="card mt-3 divide-y divide-line">
                  {unpaid.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                      <span className="min-w-0 break-words font-medium">{m.event?.slug ? <Link href={`/${lang}/eventos/${m.event.slug}`} className="hover:text-brand-hot">{m.event.name}</Link> : m.event?.name ?? "—"}{m.event?.date ? <span className="font-normal text-muted"> · {fmtDate(m.event.date, lang)}</span> : null}</span>
                      <span className="tabular-nums">{mxn(m.amountCents / 100, lang)}</span>
                      <span className="basis-full whitespace-pre-line break-words text-xs text-muted">{t.account.payHow}: {m.event?.paymentInfo || t.pay.noInstructions}</span>
                    </div>
                  ))}
                  <p className="p-4 text-sm font-medium">{t.account.pendingTotal} <span className="tabular-nums">{mxn(unpaidCents / 100, lang)}</span></p>
                </div>
              )}
            </section>

            <h2 className="mt-12 text-xl font-semibold">{t.account.upcoming}</h2>
            <div className="mt-3 space-y-3">
              {upcoming.length === 0 && <p className="text-muted">{t.account.noRegistrations}</p>}
              {upcoming.map((m) => {
                const paid = m.paymentStatus === "pagado";
                const inner = (
                  <>
                    <span><span className="font-medium">{m.event?.name ?? "—"}</span><span className="block text-sm text-muted">{m.category}{m.role ? ` · ${t.roles[m.role as "header" | "heeler"]}` : ""}{m.event?.date ? ` · ${fmtDate(m.event.date, lang)}` : ""}{m.event?.city ? ` · ${m.event.city}` : ""}</span>{m.event?.closesAt && <span className="block text-xs text-muted">{Date.parse(m.event.closesAt) > Date.now() ? t.event.closesOn : t.org.ev.closesAtPast} {fmtDeadline(m.event.closesAt, m.event.timezone, lang)}</span>}</span>
                    <span className="text-right text-sm"><span className="block tabular-nums">{mxn(m.amountCents / 100, lang)}</span>
                      <span className={`text-xs font-medium ${paid ? "text-emerald-700" : "text-brand-hot"}`}>{paid ? `${t.account.paid} ✓${m.paymentMethod ? ` · ${t.pay.method[m.paymentMethod as "efectivo" | "transferencia" | "stripe"]}` : ""}` : t.account.pending}</span></span>
                  </>
                );
                return (
                  <div key={m.id} className="card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {m.event?.slug ? <Link href={`/${lang}/eventos/${m.event.slug}`} className="flex min-w-[15rem] flex-1 items-center justify-between gap-3">{inner}</Link> : <div className="flex min-w-[15rem] flex-1 items-center justify-between gap-3">{inner}</div>}
                      {!paid && (
                        <form action={cancelRegistration}>
                          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={m.id} />
                          <button className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">{t.account.cancel}</button>
                        </form>
                      )}
                    </div>
                    {s.roleChoice?.role === "both" && m.event && m.event.status === "publicado" && isRegistrationOpen({ closesAt: m.event.closesAt, closed: m.event.registrationClosed }) && (
                      <form action={changeRegistrationRole} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={m.id} />
                        <label htmlFor={`role-${m.id}`} className="text-muted">{t.account.regRole}</label>
                        <select id={`role-${m.id}`} name="role" defaultValue={m.role ?? s.roleChoice.favorite ?? "header"} className="rounded-xl border border-line bg-white px-3 py-1.5 text-sm">
                          <option value="header">{t.roles.header}</option><option value="heeler">{t.roles.heeler}</option>
                        </select>
                        <button className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">{t.account.changeRole}</button>
                      </form>
                    )}
                    {!paid && (
                      <div className="mt-4 rounded-2xl bg-sand p-4 text-sm">
                        <p className="font-semibold">{t.pay.howTitle}</p>
                        {stripeOn && <div className="mt-3 max-w-xs"><PayButton registrationId={m.id} lang={lang} label={`${t.pay.online} · ${mxn(m.amountCents / 100, lang)}`} busyLabel={t.pay.onlineBusy} errors={t.pay.errors} /><p className="mt-1.5 text-xs text-muted">{t.pay.onlineHint}</p></div>}
                        <p className={`${stripeOn ? "mt-3" : "mt-2"} text-muted`}>{stripeOn ? t.pay.offlineHint : ""}</p>
                        {m.event?.paymentInfo ? <p className="mt-1 whitespace-pre-line">{m.event.paymentInfo}</p> : <p className="mt-1 text-muted">{t.pay.noInstructions}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {waiting.length > 0 && (
              <section aria-labelledby="espera" className="mt-12" data-testid="my-waitlist">
                <h2 id="espera" className="text-xl font-semibold">{t.account.waitlistTitle}</h2>
                <p className="mt-1 text-sm text-muted">{t.account.waitlistHint}</p>
                <div className="mt-3 space-y-3">
                  {waiting.filter((w) => w.event?.status === "publicado").map((w) => (
                    <div key={w.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-[15rem] flex-1">
                        {w.event?.slug ? <Link href={`/${lang}/eventos/${w.event.slug}`} className="font-medium hover:underline">{w.event.name}</Link> : <span className="font-medium">{w.event?.name ?? "—"}</span>}
                        <span className="block text-sm text-muted">{w.category}{w.role ? ` · ${t.roles[w.role as "header" | "heeler"]}` : ""}{w.event?.date ? ` · ${fmtDate(w.event.date, lang)}` : ""}{w.event?.city ? ` · ${w.event.city}` : ""}</span>
                      </div>
                      <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-hot tabular-nums">{t.account.waitlistPlace(w.place)}</span>
                      <form action={leaveWaitlist}>
                        <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={w.id} />
                        <button className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">{t.account.waitlistLeave}</button>
                      </form>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="pasados" className="mt-12">
              <h2 id="pasados" className="text-xl font-semibold">{t.account.pastEvents}</h2>
              {pastRegs.length === 0 ? <p className="mt-3 text-muted">{t.account.noPast}</p> : (
                <div className="card mt-3 divide-y divide-line">
                  {pastRegs.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                      <span className="min-w-0 break-words font-medium">{m.event?.slug ? <Link href={`/${lang}/eventos/${m.event.slug}`} className="hover:text-brand-hot">{m.event.name}</Link> : m.event?.name ?? "—"}<span className="block font-normal text-muted">{m.category}{m.role ? ` · ${t.roles[m.role as "header" | "heeler"]}` : ""}{m.event?.date ? ` · ${fmtDate(m.event.date, lang)}` : ""}</span></span>
                      <span className={m.paymentStatus === "pagado" ? "text-emerald-700" : "text-muted"}>{m.paymentStatus === "pagado" ? `${t.account.paid} ✓` : t.account.pending}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Suspense fallback={<HistorySkeleton />}>
              <RoperHistorySection id={s.roperId!} lang={lang} t={t} />
            </Suspense>

            {removed.length > 0 && (
              <section aria-labelledby="removed" className="mt-12">
                <h2 id="removed" className="text-xl font-semibold">{t.account.removedTitle}</h2>
                <div className="mt-3 space-y-3">
                  {removed.map((x) => (
                    <div key={x.id} className="card border-red-200 p-4">
                      <p className="font-medium">{x.event?.slug ? <Link href={`/${lang}/eventos/${x.event.slug}`} className="hover:text-brand-hot">{x.event.name}</Link> : x.event?.name ?? "—"}<span className="ml-2 text-sm font-normal text-muted">{x.category} · {t.account.removedOn} {fmtDate(x.removedAt.slice(0, 10), lang)}</span></p>
                      <p className="mt-1 text-sm"><span className="font-medium">{t.account.removedReason}</span> <span className="whitespace-pre-line">{x.reason}</span></p>
                      {x.refundPending && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.account.removedRefund}</p>}
                      <p className="mt-2 text-xs text-muted">{x.canReenroll ? t.account.removedCanReturn : t.account.removedBlocked}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <h2 className="mt-12 text-xl font-semibold">{t.account.available}</h2>
            <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {available.length ? available.map((e) => <EventCard key={e.id} e={e} lang={lang} t={t} />) : <p className="text-muted">{t.account.noneAvailable}</p>}
            </div>

            <div className="mt-12 flex items-end justify-between">
              <h2 className="text-xl font-semibold">{t.account.ranking}</h2>
              <Link href={`/${lang}/participantes`} className="text-sm font-medium text-brand-hot hover:underline">{t.account.seeAll} →</Link>
            </div>
            <div className="mt-2">{top.length ? top.map((r, i) => <RoperCard key={r.id} r={r} rank={i + 1} lang={lang} t={t} />) : <p className="pt-3 text-muted">{t.people.empty}</p>}</div>
          </div>
        );
      }}
    </Gate>
  );
}

export default function MiCuenta(props: PageProps<"/[lang]/mi-cuenta">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
