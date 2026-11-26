import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CopyId } from "@/components/CopyId";
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
    <div className="mx-auto max-w-3xl px-5 pb-10 pt-6 sm:pt-10">
      <Link href={`/${lang}/participantes`} className="inline-block py-1.5 text-sm text-muted hover:text-ink">← {t.people.title}</Link>
      {/* Mismo encabezado que «Mi cuenta»: foto con el rating encima, nombre y etiquetas. */}
      <div className="mt-3 flex items-start gap-3 sm:gap-4">
        <div className="relative shrink-0">
          <Avatar name={r.name} initials={initials(r.name)} url={publicAvatarUrl(r.avatarPath)} className="size-14 text-base sm:size-16 sm:text-lg" />
          {modes[0] && <span role="img" aria-label={`${t.people.rating}: ${fmtRating(r.stats[modes[0].id]!.rating)}`} className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-cream bg-brand px-2 text-xs font-semibold tabular-nums text-ink">{fmtRating(r.stats[modes[0].id]!.rating)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold leading-tight sm:text-3xl">{r.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
            {r.role && <span className="inline-flex min-h-8 items-center rounded-full bg-sand px-2.5 text-[13px] font-medium sm:px-3 sm:text-sm">{r.role.role === "both" && r.role.favorite ? `${t.roles.both} · ${t.roles[r.role.favorite]}` : roleText(r.role, t.roles)}</span>}
            {r.shortId && <CopyId chip id={r.shortId} label={t.people.idLabel} copy={t.people.copyId} copied={t.people.idCopied} />}
            {modes.slice(1).map((d) => <span key={d.id} className="inline-flex min-h-8 items-center rounded-full bg-sand px-3 text-sm tabular-nums">{t.disc[d.id].label} {fmtRating(r.stats[d.id]!.rating)}</span>)}
          </div>
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
