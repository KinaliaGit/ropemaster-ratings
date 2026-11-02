import Link from "next/link";
import { initials, type Roper } from "@/lib/mock";

export function RoperCard({ r, rank }: { r: Roper; rank?: number }) {
  return (
    <Link href={`/participantes/${r.id}`} className="card card-link flex items-center gap-4 p-4">
      {rank && <span className="w-5 text-center font-display text-lg font-bold text-muted">{rank}</span>}
      <div className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-bold text-brand-hot">{initials(r.name)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{r.name}{r.verified && <span title="Perfil verificado" className="ml-1 text-brand">✓</span>}</p>
        <p className="text-sm text-muted">{r.events} eventos · {r.wins} victorias</p>
      </div>
      <div className="text-right">
        <p className="font-display text-3xl font-bold leading-none">{r.rating}</p>
        <p className="label mt-1 !text-[0.6rem]">Rating</p>
      </div>
    </Link>
  );
}
