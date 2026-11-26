import type { Dict } from "@/dictionaries/es";
import { fmtRating, initials, publicAvatarUrl } from "@/lib/people";
import type { RankedRow } from "@/lib/ranking";

export type ParticipantRow = { id: string; href: string; name: string; initials: string; photo: string | null; sub: string; rating: string; rank: number };

// Fila del ranking tal como la pinta la lista (con los textos en el idioma de la visita). La usan la página y el endpoint de "ver más",
// para que la primera página y las siguientes se vean igual.
export function toParticipantRow(r: RankedRow, lang: string, t: Dict): ParticipantRow {
  return {
    id: r.id, href: `/${lang}/participantes/${r.id}`, name: r.name, initials: initials(r.name), photo: publicAvatarUrl(r.avatarPath), rank: r.rank,
    sub: r.initial ? "" : `${r.events} ${t.plural.event(r.events)} · ${r.wins} ${t.plural.win(r.wins)}`, rating: fmtRating(r.rating),
  };
}
