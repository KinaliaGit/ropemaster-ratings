import type { Dict } from "@/dictionaries/es";
import { fmtRating, initials, publicAvatarUrl } from "@/lib/people";
import type { EnrolledRow } from "@/lib/enrolled";

// Fila de un inscrito tal como la pinta la lista, con los textos en el idioma de la visita. La usan la página del evento (primera tanda)
// y el endpoint de "ver más", para que todo se vea igual venga de donde venga.
export type EnrolledItem = { id: string; href: string; name: string; initials: string; photo: string | null; sub: string; rating: string };

export function toEnrolledItem(r: EnrolledRow, lang: string, t: Dict): EnrolledItem {
  return {
    id: r.id, href: `/${lang}/participantes/${r.id}`, name: r.name, initials: initials(r.name), photo: publicAvatarUrl(r.avatarPath),
    sub: r.initial ? t.people.initialRating : `${r.events} ${t.plural.event(r.events)} · ${r.wins} ${t.plural.win(r.wins)}`, rating: fmtRating(r.rating),
  };
}
