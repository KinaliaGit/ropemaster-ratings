import type { Dict } from "@/dictionaries/es";
import { fmtTime, initials, publicAvatarUrl } from "@/lib/people";
import type { EventResultRow } from "@/lib/event-results";

// Fila de un resultado del evento tal como la pinta la lista, con los textos en el idioma de la visita. La usan la página del evento
// (primera tanda) y el endpoint de "ver más", para que todo se vea igual venga de donde venga.
export type ResultItem = {
  id: string; href: string | null; name: string; initials: string; photo: string | null; place: string;
  sub: string | null; result: string; penalty: string | null; dq: boolean; hasRounds: boolean;
};

export function toResultItem(r: EventResultRow, lang: string, t: Dict): ResultItem {
  const p = t.people;
  const name = r.name || p.unknownName;
  const parts = [
    r.completedRuns != null ? `${r.completedRuns} ${p.runsCount}` : null,
    r.ntCount ? `${r.ntCount} ${p.noTime.toLowerCase()}` : null,
    r.dqCount ? `${r.dqCount} DQ` : null,
  ].filter((x): x is string => x !== null);
  return {
    id: r.id, href: r.roperId ? `/${lang}/participantes/${r.roperId}` : null, name, initials: initials(name), photo: publicAvatarUrl(r.avatarPath),
    place: r.place != null ? String(r.place) : "–", sub: parts.length ? parts.join(" · ") : null,
    result: r.disqualified ? p.dq : fmtTime(r.timeMs), penalty: !r.disqualified && r.penaltyMs > 0 ? `+${fmtTime(r.penaltyMs)}` : null,
    dq: r.disqualified, hasRounds: r.hasRounds,
  };
}
