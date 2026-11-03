import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { notFound } from "next/navigation";
import { events, ropers } from "@/lib/mock";
import { fmtDate, mxn } from "@/lib/format";
import { RoperCard } from "@/components/RoperCard";
import { EventCover } from "@/components/EventCover";
import { LOCALES, getDictionary, resolveLang } from "@/lib/i18n";

// Prerenderiza cada página por idioma para que la navegación sea instantánea.
// TODO: con Supabase, listar aquí los ids reales (o dejar que se generen bajo demanda).
export function generateStaticParams() {
  return LOCALES.flatMap((lang) => events.map((x) => ({ lang, id: x.id })));
}

async function EventoInner({ params }: { params: PageProps<"/[lang]/eventos/[id]">["params"] }) {
  const lang = await resolveLang(params);
  const { id } = await params;
  const t = getDictionary(lang);
  const e = events.find((x) => x.id === id);
  if (!e || e.status === "borrador") notFound();
  const inscritos = ropers.filter((r) => e.registered.includes(r.id));
  const open = e.status === "publicado" && e.registered.length < e.capacity;
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-8">
      <div className="relative h-64 overflow-hidden rounded-[28px] bg-sand sm:h-80">
        <EventCover e={e} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
          <h1 className="text-3xl font-semibold sm:text-5xl">{e.name}</h1>
          <p className="mt-2 text-white/85">{e.city} · {fmtDate(e.date, lang)}</p>
        </div>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="text-sm text-muted">{e.venue} · {t.event.organizedBy} {e.organizer}</p>
          <p className="mt-3 max-w-2xl text-lg">{e.description}</p>

          <h2 className="mt-12 text-xl font-semibold">{t.event.photos}</h2>
          {e.photos.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {e.photos.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className="aspect-square w-full rounded-2xl object-cover" />
              ))}
            </div>
          ) : <p className="mt-3 text-muted">{t.event.noPhotos}</p>}

          <h2 className="mt-12 text-xl font-semibold">{t.event.enrolled} <span className="font-normal text-muted">{inscritos.length}/{e.capacity}</span></h2>
          <div className="mt-2">
            {inscritos.length ? inscritos.map((r) => <RoperCard key={r.id} r={r} lang={lang} t={t} discipline={e.disciplines[0] as "lazo"} />) : <p className="mt-3 text-muted">{t.event.noEnrolled}</p>}
          </div>
        </div>

        <aside className="card h-fit p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold">{t.event.enrollment}</h2>
          <ul className="mt-4">
            {e.categories.map((c) => <li key={c.name} className="flex justify-between border-b border-line py-3 text-sm last:border-0"><span>{c.name}</span><span className="tabular-nums">{mxn(c.fee, lang)}</span></li>)}
          </ul>
          {open
            ? <Link href={`/${lang}/eventos/${e.id}/inscribirse`} className="mt-4 block rounded-full bg-ink py-3 text-center text-sm font-medium text-white transition hover:bg-brand-hot">{t.event.enroll}</Link>
            : <p className="mt-4 rounded-full bg-sand py-3 text-center text-sm text-muted">{e.status === "finalizado" ? t.event.eventFinished : t.event.full}</p>}
          <p className="mt-3 text-center text-xs text-muted">{t.event.needAccount}</p>
        </aside>
      </div>
    </div>
  );
}

export default function Evento(props: PageProps<"/[lang]/eventos/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EventoInner params={props.params} />
    </Suspense>
  );
}
