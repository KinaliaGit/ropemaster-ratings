import Link from "next/link";
import { fmtDate, type Lang } from "@/lib/format";
import { type EventItem } from "@/lib/types";
import { EventCover } from "@/components/EventCover";
import { eventPhase, statusByDate } from "@/lib/event-time";
import type { Dict } from "@/dictionaries/es";

// Tarjeta tipo cartel: el flyer vertical (2:3) se ve completo y el texto va DEBAJO (el flyer ya trae el suyo).
// Sin flyer, el cartel genérico lleva el nombre encima para que la tarjeta no quede vacía.
// `eager`: las primeras tarjetas (las que se ven al abrir la página) cargan de inmediato; el resto, al acercarse.
const CARD_SIZES = "(min-width: 1152px) 276px, (min-width: 768px) 33vw, (min-width: 480px) 50vw, 100vw";
export function EventCard({ e, lang, t, eager = false }: { e: EventItem; lang: Lang; t: Dict; eager?: boolean }) {
  // Etapa real del evento: también cuenta la apertura programada y el cierre de inscripciones (antes todo lo no lleno decía "abiertas").
  const phase = eventPhase({ status: statusByDate(e), enrolled: e.enrolled, capacity: e.capacity, opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed });
  const tag = phase === "finished" ? t.status.finished : t.series.phase[phase];
  const muted = phase === "full" || phase === "closed" || phase === "upcoming";
  return (
    <Link href={`/${lang}/eventos/${e.id}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-[24px] bg-sand shadow-[0_10px_30px_-18px_rgba(20,19,17,0.5)]">
        <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.03]"><EventCover e={e} sizes={CARD_SIZES} eager={eager} /></div>
        {!e.cover && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
            <h3 className="absolute inset-x-0 bottom-0 p-5 text-xl font-semibold leading-tight text-white">{e.name}</h3>
          </>
        )}
      </div>
      <div className="mt-3 px-1">
        <h3 className="font-semibold leading-tight">{e.name}</h3>
        <p className="mt-0.5 text-sm text-muted">{e.city}{e.date ? ` · ${fmtDate(e.date, lang)}` : ""}</p>
        <p className="text-xs text-muted" data-testid="card-draw-type">{e.drawType === "lazada_sorteada" ? t.event.lazadaSorteada : t.event.roundRobin}</p>
        {/* La etiqueta va debajo para no tapar nada del flyer. */}
        <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${phase === "finished" ? "bg-ink text-white" : muted ? "bg-sand text-muted" : "bg-brand-soft text-brand-hot"}`}>{tag}</span>
      </div>
    </Link>
  );
}
