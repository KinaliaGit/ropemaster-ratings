import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { listArenas } from "@/lib/data/arenas";
import { createArena } from "@/lib/arena-actions";
import { getDictionary, resolveLang } from "@/lib/i18n";

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

// Catálogo de arenas del organizador (KIN-751): los lugares que reutiliza al crear eventos y series, cada uno con su historial.
async function Page({ props }: { props: PageProps<"/[lang]/organizador/arenas"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const a = t.org.arenas;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/arenas`}>
      {async (s) => {
        if (!s.verified) redirect(`/${lang}/organizador`);
        const arenas = await listArenas();
        return (
          <>
            <OrgNav lang={lang} t={t} admin={s.isAdmin} />
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
              <h1 className="text-3xl font-semibold">{a.title}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted">{a.blurb}</p>
              {sp.agregada === "1" && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{a.added}</p>}
              {sp.borrada === "1" && <p role="status" className="mt-6 rounded-2xl bg-brand-soft p-4 text-sm font-medium">{a.deleteTitle} ✓</p>}
              {error && <p role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{(a.errors as Record<string, string>)[error] ?? a.errors.failed}</p>}

              {arenas.length === 0 ? <p className="mt-6 rounded-2xl bg-sand p-6 text-center text-muted" data-testid="arenas-empty">{a.none}</p> : (
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="arenas-list">
                  {arenas.map((x) => (
                    <Link key={x.id} href={`/${lang}/organizador/arenas/${x.id}`} className="card block p-5">
                      <p className="text-lg font-semibold leading-snug">{x.name}</p>
                      {x.city && <p className="mt-0.5 text-sm text-muted">{x.city}</p>}
                      <p className="mt-3 text-sm"><span className="font-medium tabular-nums">{x.events}</span> {a.events} · <span className="font-medium tabular-nums">{x.series}</span> {a.series}</p>
                      <p className="mt-3 text-sm font-medium text-brand-hot">{a.open} →</p>
                    </Link>
                  ))}
                </div>
              )}

              <h2 className="mt-10 text-xl font-semibold">{a.newTitle}</h2>
              <form action={createArena} className="card mt-3 space-y-4 p-5">
                <input type="hidden" name="lang" value={lang} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">{a.name}<input required name="name" maxLength={120} className={input} /></label>
                  <label className="block text-sm font-medium">{a.city}<input name="city" maxLength={80} className={input} /></label>
                </div>
                <label className="block text-sm font-medium">{a.notes}<textarea name="notes" rows={2} maxLength={500} className={input} /></label>
                <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{a.add}</button>
              </form>
            </div>
          </>
        );
      }}
    </Gate>
  );
}

export default function ArenasOrg(props: PageProps<"/[lang]/organizador/arenas">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
