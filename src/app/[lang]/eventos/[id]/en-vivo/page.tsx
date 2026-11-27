import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink } from "@/components/BackLink";
import { LiveView } from "@/components/LiveView";
import { PageSkeleton } from "@/components/PageSkeleton";
import { toLiveSnapshot, type LiveRow } from "@/lib/app-live";
import { getPublicEvent } from "@/lib/data/events";
import { LIVE_DEMO, LIVE_VIEW } from "@/lib/flags";
import { getDictionary, resolveLang } from "@/lib/i18n";
import { adminClient } from "@/lib/supabase/admin";

// Vista pública de un evento en vivo (KIN-558 diseño de Anita; KIN-787 datos reales). La primera foto sale del servidor y después la página la sondea sola.
// Solo existe para eventos que se pueden ver en público (`getPublicEvent`); `get_live_snapshot` además exige que sean públicos.
async function Page({ params }: { params: PageProps<"/[lang]/eventos/[id]/en-vivo">["params"] }) {
  await connection();
  const lang = await resolveLang(params);
  const { id } = await params;
  const e = LIVE_VIEW ? await getPublicEvent(id) : null;
  if (!e?.uuid) notFound();
  const t = getDictionary(lang);
  const { data } = (await adminClient()?.rpc("get_live_snapshot", { p_event: e.uuid })) ?? { data: null };
  const row = (data as LiveRow[] | null)?.[0];
  return (
    <div className="page">
      <BackLink href={`/${lang}`}>{t.nav.events}</BackLink>
      <div className="mt-4">
        <LiveView
          eventId={e.uuid}
          initial={row ? toLiveSnapshot(row) : null}
          demo={LIVE_DEMO ? { name: e.name, venue: [e.venue, e.city].filter(Boolean).join(", ") } : null}
          labels={t.live}
        />
      </div>
      <div className="mt-6 text-center">
        <Link href={`/${lang}/eventos/${e.id}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-6 text-sm font-medium hover:border-ink">{t.live.details}</Link>
      </div>
    </div>
  );
}

export default function EventoEnVivo(props: PageProps<"/[lang]/eventos/[id]/en-vivo">) {
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
