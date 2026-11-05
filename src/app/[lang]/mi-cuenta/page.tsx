import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { AvatarUploader } from "@/components/AvatarUploader";
import { avatarUrl } from "@/lib/avatars";
import { EventCard } from "@/components/EventCard";
import { RoperCard } from "@/components/RoperCard";
import { initials } from "@/lib/people";
import { listRanking } from "@/lib/data/ropers";
import { listPublicEvents } from "@/lib/data/events";
import { fmtDate, mxn } from "@/lib/format";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ params }: { params: PageProps<"/[lang]/mi-cuenta">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const [events, top] = await Promise.all([listPublicEvents(), listRanking("lazo").then((r) => r.slice(0, 4))]);
  return (
    <Gate lang={lang} role="participante" next={`/${lang}/mi-cuenta`}>
      {(s) => {
        // Participante de DEMOSTRACIÓN (sin fila en la base); el real llega con el login por celular (KIN-576).
        const mine = events.filter((e) => e.registered.includes(s.id));
        const available = events.filter((e) => e.status === "publicado" && !e.registered.includes(s.id));
        return (
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-10">
            <div className="flex flex-wrap items-center gap-5">
              <AvatarUploader url={avatarUrl(s.id)} initials={initials(s.name)} name={s.name} l={t.account.photo} />
              <div className="flex-1">
                <p className="label">{t.account.type}</p>
                <h1 className="text-3xl font-semibold">{s.name}</h1>
                <p className="text-sm text-muted">{t.account.demo}</p>
              </div>
            </div>

            <h2 className="mt-12 text-xl font-semibold">{t.account.myRegistrations}</h2>
            <div className="mt-3 space-y-3">
              {mine.length === 0 && <p className="text-muted">{t.account.noRegistrations}</p>}
              {mine.map((e) => {
                const paid = !e.unpaid?.includes(s.id);
                return (
                  <Link key={e.id} href={`/${lang}/eventos/${e.id}`} className="card card-link flex items-center justify-between p-4">
                    <span><span className="font-medium">{e.name}</span><span className="block text-sm text-muted">{fmtDate(e.date, lang)} · {e.city}</span></span>
                    <span className="text-right text-sm"><span className="block tabular-nums">{mxn(e.categories[0].fee, lang)}</span>
                      <span className={`text-xs font-medium ${paid ? "text-brand-hot" : "text-red-700"}`}>{paid ? `${t.account.paid} ✓` : t.account.pending}</span></span>
                  </Link>
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
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
