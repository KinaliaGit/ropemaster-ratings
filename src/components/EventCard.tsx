import Link from "next/link";
import { fmtDate, mxn, type EventItem } from "@/lib/mock";

export function EventCard({ e }: { e: EventItem }) {
  const min = Math.min(...e.categories.map((c) => c.fee));
  const full = e.registered.length >= e.capacity;
  return (
    <Link href={`/eventos/${e.id}`} className="group flex flex-col rounded-2xl border border-line bg-white p-5 transition hover:border-brand hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-xs uppercase text-brand-hot">{fmtDate(e.date)}</p>
        <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase ${e.status === "finalizado" ? "bg-sand text-muted" : full ? "bg-ink text-cream" : "bg-brand-soft text-brand-hot"}`}>
          {e.status === "finalizado" ? "Finalizado" : full ? "Cupo lleno" : "Inscripciones abiertas"}
        </span>
      </div>
      <h2 className="mt-2 font-display text-xl font-bold group-hover:text-brand-hot">{e.name}</h2>
      <p className="mt-1 text-sm text-muted">{e.venue} · {e.city}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {e.disciplines.map((d) => <span key={d} className="rounded-full bg-sand px-3 py-1 text-xs font-semibold">{d}</span>)}
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-line pt-3 text-sm">
        <span className="font-mono text-xs text-muted">{e.registered.length}/{e.capacity} inscritos</span>
        <span className="font-semibold">{e.status === "finalizado" ? "Ver resultados" : `desde ${mxn(min)}`}</span>
      </div>
    </Link>
  );
}
