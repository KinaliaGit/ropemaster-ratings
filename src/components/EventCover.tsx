import Image from "next/image";
import type { EventItem } from "@/lib/types";

// Sin imagen, un degradado sobrio por evento. Con imagen (cover) se muestra COMPLETA, sin recortar: los flyers de los eventos son verticales
// (cartel 2:3) y traen su propio texto. Sobre un fondo desenfocado de la misma imagen, la imagen entera se ajusta al marco (sirve vertical u horizontal).
const TONES = [
  "linear-gradient(160deg,#f2a15e 0%,#b8470f 100%)",
  "linear-gradient(160deg,#7d98a3 0%,#25414d 100%)",
  "linear-gradient(160deg,#b39a74 0%,#3f2d1b 100%)",
];

// `sizes` dice cuánto mide el cartel en pantalla para que el navegador pida una versión de ese tamaño (no el original de hasta 1.5 MB).
// `eager`: para el cartel que se ve al abrir la página (se pide de inmediato y con prioridad); los demás cargan al acercarse.
// El fondo desenfocado se pide en miniatura (32 px): al difuminarlo se ve igual y casi no pesa.
export function EventCover({ e, className = "", sizes = "100vw", eager = false }: { e: Pick<EventItem, "cover" | "tone">; className?: string; sizes?: string; eager?: boolean }) {
  return (
    <div className={`absolute inset-0 ${className}`} style={e.cover ? undefined : { background: TONES[e.tone % TONES.length] }}>
      {e.cover ? (
        <>
          <Image src={e.cover} alt="" aria-hidden fill sizes="32px" className="scale-110 object-cover opacity-70 blur-2xl" />
          <Image src={e.cover} alt="" fill sizes={sizes} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} className="object-contain" />
        </>
      ) : (
        <Image src="/hero-roping.png" alt="" width={560} height={916} sizes="200px" className="absolute -right-4 bottom-10 h-3/4 w-auto opacity-[0.12] brightness-0 invert" />
      )}
    </div>
  );
}
