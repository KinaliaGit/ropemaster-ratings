import Link from "next/link";
import { initials, type Roper } from "@/lib/mock";

// Fila limpia de ranking: sin tarjeta, solo una línea divisoria.
export function RoperCard({ r, rank }: { r: Roper; rank?: number }) {
  return (
    <Link href={`/participantes/${r.id}`} className="group flex items-center gap-4 border-b border-line py-4 transition hover:bg-sand/60 sm:px-2">
      {rank && <span className="w-6 text-sm text-muted tabular-nums">{rank}</span>}
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-sand text-sm font-semibold">{initials(r.name)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.name}{r.verified && <span title="Perfil verificado" className="ml-1 text-brand">✓</span>}</p>
        <p className="text-sm text-muted">{r.events} {r.events === 1 ? "evento" : "eventos"} · {r.wins} {r.wins === 1 ? "victoria" : "victorias"}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums group-hover:text-brand-hot">{r.rating}</p>
    </Link>
  );
}
