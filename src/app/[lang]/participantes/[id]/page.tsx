import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { RoperHistorySection } from "@/components/RoperHistorySection";
import { HistorySkeleton, ProfileSkeleton } from "@/components/ProfileSkeleton";
import { getPublicRoper } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { roleText } from "@/lib/roles";
import { fmtRating, initials, publicAvatarUrl } from "@/lib/people";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function PerfilInner({ params }: { params: PageProps<"/[lang]/participantes/[id]">["params"] }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang = await resolveLang(params);
  const { id } = await params;
  const t = getDictionary(lang);
  const r = await getPublicRoper(id);
  if (!r) notFound();
  const modes = ACTIVE_DISCIPLINES.filter((d) => r.stats[d.id]);
  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-12">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={r.name} initials={initials(r.name)} url={publicAvatarUrl(r.avatarPath)} className="size-20 text-2xl" />
        <div className="flex-1">
          <h1 className="text-4xl font-semibold">{r.name}</h1>
          {r.role && <p className="mt-2"><span className="rounded-full bg-sand px-3 py-1 text-sm font-medium">{roleText(r.role, t.roles)}</span></p>}
        </div>
        <div className="flex gap-8 text-right">
          {modes.map((d) => (
            <div key={d.id}>
              <p className="text-6xl font-semibold leading-none tabular-nums">{fmtRating(r.stats[d.id]!.rating)}<span className="text-2xl text-muted">/10</span></p>
              <p className="label mt-2">{modes.length > 1 ? t.disc[d.id].label : t.people.rating}</p>
            </div>
          ))}
        </div>
      </div>

      <Suspense fallback={<HistorySkeleton />}>
        <RoperHistorySection id={r.id} lang={lang} t={t} />
      </Suspense>

      <p className="mt-6 text-xs text-muted">{t.people.contactNote} <Link href={`/${lang}/registro`} className="underline">{t.people.report}</Link>.</p>
    </div>
  );
}

export default function Perfil(props: PageProps<"/[lang]/participantes/[id]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <PerfilInner params={props.params} />
    </Suspense>
  );
}
