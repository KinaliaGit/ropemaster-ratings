import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/lib/data/events";
import { getEventRegistrants } from "@/lib/data/registrations";
import { DEFAULT_DISCIPLINE } from "@/lib/disciplines";
import { toEnrolledItem } from "@/lib/enrolled-view";
import { fmtDate, mxn, type Lang } from "@/lib/format";
import Image from "next/image";
import { EnrolledList } from "@/components/EnrolledList";
import { EnrolledSkeleton, EventSkeleton } from "@/components/EventSkeleton";
import { EventCover } from "@/components/EventCover";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Dict } from "@/dictionaries/es";

// Lista de inscritos: va aparte para que el cartel, las categorías y el botón de inscribirse salgan sin esperarla (KIN-612 y KIN-611).
async function Enrolled({ slug, uuid, discipline, lang, t }: { slug: string; uuid: string; discipline: string; lang: Lang; t: Dict }) {
  const page = await getEventRegistrants(uuid, discipline);
  if (page.rows.length === 0) return <p className="mt-3 text-muted">{t.event.noEnrolled}</p>;
  return (
    <EnrolledList
      slug={slug} lang={lang} initial={page.rows.map((r) => toEnrolledItem(r, lang, t))} next={page.next}
      labels={{ loadMore: t.people.loadMore, loadError: t.people.loadError }}
    />
  );
}

async function EventoInner({ params }: { params: PageProps<"/[lang]/eventos/[id]">["params"] }) {
  // Los datos públicos se leen al atender la visita, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const lang = await resolveLang(params);
  const { id } = await params;
  const t = getDictionary(lang);
  const e = await getPublicEvent(id);
  if (!e) notFound();
  const open = e.status === "publicado" && e.enrolled < e.capacity;
  const gallery = e.photos.filter((p) => p.url !== e.cover); // el flyer de portada ya se ve arriba
  const fromFee = e.categories.length ? Math.min(...e.categories.map((c) => c.fee)) : 0;
  const meta = [e.date ? fmtDate(e.date, lang) : "", [e.venue, e.city].filter(Boolean).join(", ")].filter(Boolean);
  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 pt-8">
      {/* Celular: barra fija abajo con el botón de inscripción siempre a la mano (a todo el ancho; el selector de idioma en celular va en el pie). */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/90 p-3 backdrop-blur-xl lg:hidden">
          <Link href={`/${lang}/eventos/${e.id}/inscribirse`} className="block whitespace-nowrap rounded-full bg-ink px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-brand-hot">
            {t.event.enroll} · <span className="tabular-nums text-white/80">{t.event.from} {mxn(fromFee, lang).replace(" MXN", "")}</span>
          </Link>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-12">
        {/* Cartel: el flyer vertical completo (2:3), sin recortes ni texto encima. */}
        <div className="mx-auto w-full max-w-sm lg:max-w-none">
          <div className="relative aspect-[2/3] overflow-hidden rounded-[28px] bg-sand shadow-[0_18px_48px_-24px_rgba(20,19,17,0.55)] lg:sticky lg:top-24">
            <EventCover e={e} sizes="(min-width: 1024px) 380px, (min-width: 384px) 384px, 100vw" eager />
            {!e.cover && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6 pt-24"><h2 className="text-3xl font-semibold text-white">{e.name}</h2></div>}
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">{e.name}</h1>
          <p className="mt-2 text-muted">{meta.join(" · ")}</p>
          <p className="mt-1 text-sm text-muted">{t.event.organizedBy} {e.organizer}</p>

          <aside className="card mt-6 p-6">
            <h2 className="text-lg font-semibold">{t.event.enrollment}</h2>
            <ul className="mt-3">
              {e.categories.map((c) => <li key={c.id} className="flex justify-between border-b border-line py-3 text-sm last:border-0"><span>{c.name}</span><span className="tabular-nums">{mxn(c.fee, lang)}</span></li>)}
            </ul>
            {open
              ? <Link href={`/${lang}/eventos/${e.id}/inscribirse`} className="mt-4 block rounded-full bg-ink py-3 text-center text-sm font-medium text-white transition hover:bg-brand-hot">{t.event.enroll}</Link>
              : <p className="mt-4 rounded-full bg-sand py-3 text-center text-sm text-muted">{e.status === "finalizado" ? t.event.eventFinished : t.event.full}</p>}
            <p className="mt-3 text-center text-xs text-muted">{t.event.needAccount}</p>
          </aside>

          {e.description && <p className="mt-8 max-w-2xl whitespace-pre-line text-lg">{e.description}</p>}

          <h2 className="mt-12 text-xl font-semibold">{t.event.enrolled} <span className="font-normal text-muted">{e.enrolled}/{e.capacity}</span></h2>
          <div className="mt-2">
            {e.uuid
              ? <Suspense fallback={<EnrolledSkeleton />}><Enrolled slug={e.id} uuid={e.uuid} discipline={e.disciplines[0] ?? DEFAULT_DISCIPLINE} lang={lang} t={t} /></Suspense>
              : <p className="mt-3 text-muted">{t.event.noEnrolled}</p>}
          </div>

          {gallery.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-semibold">{t.event.photos}</h2>
              {/* Fotos con su proporción real (sin recortar): columnas tipo galería. */}
              <div className="mt-4 columns-2 gap-3 sm:columns-3">
                {gallery.map(({ id: photoId, url: src }) => (
                  // Se desconoce la proporción real de cada foto: se reserva 4:3 y se ajusta al cargar. Llegan reducidas (1600 px), así que se piden al tamaño que se ven.
                  <Image key={photoId} src={src} alt="" width={800} height={600} sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw" className="mb-3 h-auto w-full break-inside-avoid rounded-2xl" />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Evento(props: PageProps<"/[lang]/eventos/[id]">) {
  return (
    <Suspense fallback={<EventSkeleton />}>
      <EventoInner params={props.params} />
    </Suspense>
  );
}
