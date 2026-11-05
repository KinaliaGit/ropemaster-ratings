import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { AvatarUploader } from "@/components/AvatarUploader";
import { EventCard } from "@/components/EventCard";
import { RoperCard } from "@/components/RoperCard";
import { initials, publicAvatarUrl } from "@/lib/people";
import { listRanking } from "@/lib/data/ropers";
import { listMyRegistrations } from "@/lib/data/registrations";
import { cancelRegistration } from "@/lib/registration-actions";
import { createMyRoperProfile } from "@/lib/profile-actions";
import { PayButton } from "@/components/PayButton";
import { listPublicEvents } from "@/lib/data/events";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/mi-cuenta"> }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang = await resolveLang(props.params);
  const stripeOn = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_TEST_CONNECTED_ACCOUNT; // el pago en línea solo se ofrece si Stripe está configurado
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const [events, top] = await Promise.all([listPublicEvents(), listRanking("lazo").then((r) => r.slice(0, 4))]);
  const notice = sp.pago === "ok" ? t.pay.returned : sp.perfil === "ok" ? t.account.profileCreated : sp.inscrito === "1" ? t.account.enrolledOk : sp.cancelado === "1" ? t.account.canceledOk : typeof sp.error === "string" ? (t.enroll.errors as Record<string, string>)[sp.error] ?? t.enroll.errors.failed : null;
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
                <button className="w-full rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{t.account.createBtn}</button>
              </form>
            </div>
          );
        }
        const mine = await listMyRegistrations();
        const mineSlugs = new Set(mine.map((m) => m.event?.slug));
        const available = events.filter((e) => e.status === "publicado" && !mineSlugs.has(e.id));
        return (
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-10">
            <div className="flex flex-wrap items-center gap-5">
              <AvatarUploader url={publicAvatarUrl(s.avatarPath)} initials={initials(s.name)} name={s.name} l={t.account.photo} />
              <div className="flex-1">
                <p className="label">{s.role === "organizador" ? t.account.typeOrganizer : t.account.type}</p>
                <h1 className="text-3xl font-semibold">{s.name}</h1>
              </div>
            </div>

            {notice && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{notice}</p>}
            <h2 className="mt-12 text-xl font-semibold">{t.account.myRegistrations}</h2>
            <div className="mt-3 space-y-3">
              {mine.length === 0 && <p className="text-muted">{t.account.noRegistrations}</p>}
              {mine.map((m) => {
                const paid = m.paymentStatus === "pagado";
                const inner = (
                  <>
                    <span><span className="font-medium">{m.event?.name ?? "—"}</span><span className="block text-sm text-muted">{m.category}{m.event?.date ? ` · ${fmtDate(m.event.date, lang)}` : ""}{m.event?.city ? ` · ${m.event.city}` : ""}</span></span>
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
