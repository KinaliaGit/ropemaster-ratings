import Link from "next/link";
import { fmtDate, type Lang } from "@/lib/format";
import { type EventItem } from "@/lib/types";
import { EventCover } from "@/components/EventCover";
import type { Dict } from "@/dictionaries/es";

// Tarjeta de foto con el texto encima (estilo galería).
export function EventCard({ e, lang, t }: { e: EventItem; lang: Lang; t: Dict }) {
  const full = e.registered.length >= e.capacity;
  const tag = e.status === "finalizado" ? t.status.finished : full ? t.status.full : t.status.open;
  return (
    <Link href={`/${lang}/eventos/${e.id}`} className="group relative block aspect-[4/3] overflow-hidden rounded-[28px] bg-sand">
      <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.03]"><EventCover e={e} /></div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      <span className="absolute left-4 top-4 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">{tag}</span>
      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <h3 className="text-lg font-semibold leading-tight">{e.name}</h3>
        <p className="mt-1 text-white/75">{e.city}</p>
        <p className="text-white/90">{fmtDate(e.date, lang)}</p>
      </div>
    </Link>
  );
}
