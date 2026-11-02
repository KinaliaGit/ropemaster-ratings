import Link from "next/link";
import { fmtDate, mxn, type EventItem } from "@/lib/mock";
import { Ring } from "@/components/Ring";

export function EventCard({ e }: { e: EventItem }) {
  const min = Math.min(...e.categories.map((c) => c.fee));
  const full = e.registered.length >= e.capacity;
  const tag = e.status === "finalizado" ? ["Finalizado", "bg-[#e5dcc9] text-muted"] : full ? ["Cupo lleno", "bg-[#fbd9cf] text-label"] : ["Abierto", "bg-[#d6e6fa] text-[#1e4a8c]"];
  return (
    <Link href={`/eventos/${e.id}`} className="card card-link flex min-h-[250px] flex-col p-6">
      <h3 className="font-display text-2xl font-bold leading-tight">{e.name}</h3>
      <span className={`mt-2 w-fit rounded-md px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] ${tag[1]}`}>{tag[0]}</span>
      <div className="mt-auto flex items-end justify-between gap-3 pt-6">
        <div className="min-w-0">
          <p className="text-sm text-muted">{e.disciplines.join(" · ")}</p>
          <p className="font-semibold">{e.city} · {fmtDate(e.date)}</p>
          <p className="mt-1 text-sm text-muted">{e.registered.length} {e.registered.length === 1 ? "inscrito" : "inscritos"} · {e.status === "finalizado" ? "ver resultados" : mxn(min)}</p>
        </div>
        <Ring value={(e.registered.length / e.capacity) * 100} />
      </div>
    </Link>
  );
}
