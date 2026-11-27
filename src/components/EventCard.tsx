import Link from "next/link";
import { type Lang } from "@/lib/format";
import { type EventItem } from "@/lib/types";
import { EventCover } from "@/components/EventCover";
import { eventPhase, isLiveToday, statusByDate } from "@/lib/event-time";
import { LIVE_VIEW } from "@/lib/flags";
import type { Dict } from "@/dictionaries/es";

// Tarjeta tipo cartel: el flyer vertical (2:3) se ve completo, sin nada encima, y debajo nombre, fecha, lugar y estado (KIN-768).
// Sin flyer, el cartel genérico lleva el nombre encima para que la tarjeta no quede vacía.
// `eager`: las primeras tarjetas (las que se ven al abrir la página) cargan de inmediato; el resto, al acercarse.
const CARD_SIZES = "(min-width: 1152px) 276px, (min-width: 768px) 33vw, 50vw";
export function EventCard({ e, lang, t, eager = false }: { e: EventItem; lang: Lang; t: Dict; eager?: boolean }) {
  // Etapa real del evento: también cuenta la apertura programada y el cierre de inscripciones (antes todo lo no lleno decía "abiertas").
  const phase = eventPhase({ status: statusByDate(e), enrolled: e.enrolled, capacity: e.capacity, opensAt: e.registrationOpensAt, closesAt: e.registrationClosesAt, closed: e.registrationClosed });
  const muted = phase === "full" || phase === "closed" || phase === "upcoming";
  // Fecha corta con día de la semana («sáb 28 nov 2026», sin «de» para que quepa en media pantalla) y lugar (arena y ciudad, sin repetir).
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { ...o, timeZone: "UTC" }).format(new Date(`${e.date}T00:00:00Z`)).replace(/\./g, "");
  const date = e.date ? [part({ weekday: "short" }), part({ day: "numeric" }), part({ month: "short" }), part({ year: "numeric" })].join(" ") : "";
  const place = [e.venue, e.city].filter((x, i, a) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).join(", ");
  const icon = "mt-0.5 size-3.5 shrink-0";
  const live = isLiveToday(e);
  return (
    <Link href={`/${lang}/eventos/${e.id}${live && LIVE_VIEW ? "/en-vivo" : ""}`} className="group block min-w-0">
      <div className="relative aspect-[2/3] overflow-hidden rounded-[20px] bg-sand shadow-[0_10px_30px_-18px_rgba(20,19,17,0.5)] sm:rounded-[24px]">
        <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.03]"><EventCover e={e} sizes={CARD_SIZES} eager={eager} /></div>
        {!e.cover && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
            <p aria-hidden className="absolute inset-x-0 bottom-0 break-words p-3 text-lg font-semibold leading-tight text-white sm:p-5 sm:text-xl">{e.name}</p>
          </>
        )}
      </div>
      <div className="mt-2 px-1">
        <h3 className="line-clamp-2 break-words font-semibold leading-tight">{e.name}</h3>
        {date && (
          <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-snug sm:text-sm">
            <svg aria-hidden viewBox="0 0 24 24" className={`${icon} text-muted`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
            <span>{date}</span>
          </p>
        )}
        {place && (
          <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-snug text-muted sm:text-sm">
            <svg aria-hidden viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <span className="line-clamp-2 min-w-0 break-words">{place}</span>
          </p>
        )}
        {live
          ? <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700"><span aria-hidden className="size-1.5 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" />{t.home.live}</span>
          : <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${phase === "finished" ? "bg-ink text-white" : muted ? "bg-sand text-muted" : "bg-brand-soft text-brand-hot"}`}>{t.home.phase[phase]}</span>}
      </div>
    </Link>
  );
}
