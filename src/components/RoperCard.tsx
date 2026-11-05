import Link from "next/link";
import { initials, fmtRating, statOf, publicAvatarUrl } from "@/lib/people";
import type { Roper } from "@/lib/types";
import { DEFAULT_DISCIPLINE, type DisciplineId } from "@/lib/disciplines";
import { Avatar } from "@/components/Avatar";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

// Fila limpia de ranking: sin tarjeta, solo una línea divisoria.
export function RoperCard({ r, rank, lang, t, discipline = DEFAULT_DISCIPLINE }: { r: Roper; rank?: number; lang: Lang; t: Dict; discipline?: DisciplineId }) {
  const st = statOf(r, discipline);
  return (
    <Link href={`/${lang}/participantes/${r.id}`} className="group flex items-center gap-4 border-b border-line py-4 transition hover:bg-sand/60 sm:px-2">
      {rank && <span className="w-6 text-sm text-muted tabular-nums">{rank}</span>}
      <Avatar name={r.name} initials={initials(r.name)} url={publicAvatarUrl(r.avatarPath)} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{r.name}</p>
        <p className="text-sm text-muted">{st ? `${st.events} ${t.plural.event(st.events)} · ${st.wins} ${t.plural.win(st.wins)}` : t.people.noRating}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums group-hover:text-brand-hot">{st ? fmtRating(st.rating) : "–"}</p>
    </Link>
  );
}
