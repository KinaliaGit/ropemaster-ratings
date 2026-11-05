import type { EventItem } from "@/lib/types";

// Sin imagen, un degradado sobrio por evento. Con imagen (cover) se muestra COMPLETA, sin recortar: los flyers de los eventos son verticales
// (cartel 2:3) y traen su propio texto. Sobre un fondo desenfocado de la misma imagen, la imagen entera se ajusta al marco (sirve vertical u horizontal).
const TONES = [
  "linear-gradient(160deg,#f2a15e 0%,#b8470f 100%)",
  "linear-gradient(160deg,#7d98a3 0%,#25414d 100%)",
  "linear-gradient(160deg,#b39a74 0%,#3f2d1b 100%)",
];

export function EventCover({ e, className = "" }: { e: Pick<EventItem, "cover" | "tone">; className?: string }) {
  return (
    <div className={`absolute inset-0 ${className}`} style={e.cover ? undefined : { background: TONES[e.tone % TONES.length] }}>
      {e.cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.cover} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.cover} alt="" className="relative size-full object-contain" />
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/hero-roping.png" alt="" className="absolute -right-4 bottom-10 h-3/4 opacity-[0.12] brightness-0 invert" />
      )}
    </div>
  );
}
