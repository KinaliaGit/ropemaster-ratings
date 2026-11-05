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
import { listPublicEvents } from "@/lib/data/events";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/mi-cuenta"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const [events, top] = await Promise.all([listPublicEvents(), listRanking("lazo").then((r) => r.slice(0, 4))]);
  const notice = sp.inscrito === "1" ? t.account.enrolledOk : sp.cancelado === "1" ? t.account.canceledOk : typeof sp.error === "string" ? (t.enroll.errors as Record<string, string>)[sp.error] ?? t.enroll.errors.failed : null;
  return (
    <Gate lang={lang} role="participante" next={`/${lang}/mi-cuenta`}>
      {async (s) => {
        const mine = await listMyRegistrations();
        const mineSlugs = new Set(mine.map((m) => m.event?.slug));
        const available = events.filter((e) => e.status === "publicado" && !mineSlugs.has(e.id));
        return (
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-10">
            <div className="flex flex-wrap items-center gap-5">
              <AvatarUploader url={publicAvatarUrl(s.avatarPath)} initials={initials(s.name)} name={s.name} l={t.account.photo} />
              <div className="flex-1">
                <p className="label">{t.account.type}</p>
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
                      <span className={`text-xs font-medium ${paid ? "text-brand-hot" : "text-red-700"}`}>{paid ? `${t.account.paid} ✓` : t.account.pending}</span></span>
                  </>
                );
                return (
                  <div key={m.id} className="card flex items-center justify-between gap-3 p-4">
                    {m.event?.slug ? <Link href={`/${lang}/eventos/${m.event.slug}`} className="flex flex-1 items-center justify-between gap-3">{inner}</Link> : <div className="flex flex-1 items-center justify-between gap-3">{inner}</div>}
                    {!paid && (
                      <form action={cancelRegistration}>
                        <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={m.id} />
                        <button className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:border-ink">{t.account.cancel}</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>

            <h2 className="mt-12 text-xl font-semibold">{t.account.available}</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
