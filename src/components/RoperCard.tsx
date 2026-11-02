import Link from "next/link";
import type { Roper } from "@/lib/mock";

export function RoperCard({ r, rank }: { r: Roper; rank?: number }) {
  return (
    <Link href={`/lazadores/${r.id}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-4 transition hover:border-brand hover:shadow-md">
      {rank && <span className="w-6 font-mono text-sm text-muted">{rank}</span>}
      <div className="grid size-12 shrink-0 place-items-center rounded-full bg-ink font-display font-bold text-brand">
        {r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{r.name}{r.verified && <span title="Perfil verificado" className="ml-1 text-brand">✓</span>}</p>
        <p className="font-mono text-xs text-muted">{r.events} eventos · {r.wins} victorias</p>
      </div>
      <div className="text-right">
        <p className="font-display text-2xl font-extrabold group-hover:text-brand-hot">{r.rating}</p>
        <p className="font-mono text-[10px] uppercase text-muted">rating</p>
      </div>
    </Link>
  );
}
