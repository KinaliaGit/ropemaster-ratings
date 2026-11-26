import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink } from "@/components/BackLink";
import { LiveDemo } from "@/components/LiveDemo";
import { PageSkeleton } from "@/components/PageSkeleton";
import { getPublicEvent } from "@/lib/data/events";
import { isLiveToday } from "@/lib/event-time";
import { LIVE_DEMO } from "@/lib/flags";
import { getDictionary, resolveLang } from "@/lib/i18n";

// KIN-558: vista pública de un evento en vivo. Muestra el nombre y la arena reales, pero los turnos y tiempos son inventados hasta que la app
// los mande; por eso solo existe en desarrollo y para eventos de hoy.
async function Page({ params }: { params: PageProps<"/[lang]/eventos/[id]/en-vivo">["params"] }) {
  await connection();
  const lang = await resolveLang(params);
  const { id } = await params;
  const e = LIVE_DEMO ? await getPublicEvent(id) : null;
  if (!e || !isLiveToday(e)) notFound();
  const t = getDictionary(lang);
  return (
    <div className="page">
      <BackLink href={`/${lang}`}>{t.nav.events}</BackLink>
      <div className="mt-4"><LiveDemo name={e.name} venue={[e.venue, e.city].filter(Boolean).join(", ")} labels={t.live} /></div>
      <div className="mt-6 text-center">
        <Link href={`/${lang}/eventos/${e.id}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:border-ink">{t.live.details}</Link>
      </div>
    </div>
  );
}

export default function EventoEnVivo(props: PageProps<"/[lang]/eventos/[id]/en-vivo">) {
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
