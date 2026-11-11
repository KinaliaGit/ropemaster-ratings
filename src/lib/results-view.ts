import type { Dict } from "@/dictionaries/es";
import { fmtDate, type Lang } from "@/lib/format";
import { fmtTime } from "@/lib/people";
import type { HistoryRow, Round } from "@/lib/results-history";

// Textos ya en el idioma de la visita para el historial del perfil. Los usan la página (primera tanda) y los endpoints de "ver más" y
// "ver rondas", para que todo se vea igual venga de donde venga.

export type HistoryItem = {
  id: string; event: string; href: string | null; verified: boolean; date: string; discipline: string;
  result: string; penalty: string | null; dq: boolean; place: string; hasRounds: boolean;
};

export function toHistoryItem(r: HistoryRow, lang: Lang, t: Dict): HistoryItem {
  const discipline = (t.disc as Record<string, { label: string }>)[r.discipline]?.label ?? r.discipline;
  return {
    id: r.id, event: r.event, href: r.eventSlug ? `/${lang}/eventos/${r.eventSlug}` : null, verified: r.eventVerified, date: fmtDate(r.date, lang), discipline,
    result: r.disqualified ? t.people.dq : fmtTime(r.timeMs), penalty: !r.disqualified && r.penaltyMs > 0 ? `+${fmtTime(r.penaltyMs)}` : null,
    dq: r.disqualified, place: r.place != null ? `#${r.place}` : "–", hasRounds: r.hasRounds,
  };
}

export type RoundItem = { key: string; title: string; tags: string[]; value: string; penalty: string | null; note: string | null };

export function toRoundItem(r: Round, index: number, t: Dict): RoundItem {
  const p = t.people;
  const stage = r.stage === "final" ? ` · ${p.roundFinal}` : r.stage === "tiebreak" ? ` · ${p.roundTiebreak}` : "";
  const value = r.status === "completed" ? fmtTime(r.timeMs) : r.status === "no_time" ? p.noTime : p.dq;
  const sub = r.substitution;
  return {
    key: `${index}-${r.stage}-${r.kind}-${r.round}`, title: `${p.round} ${r.round}${stage}`,
    tags: [...(r.kind === "extra" ? [p.extra] : []), ...(r.kind === "help" ? [p.help] : [])],
    value, penalty: r.status === "completed" && r.penaltyMs > 0 ? `+${fmtTime(r.penaltyMs)}` : null,
    note: sub ? `${p.substitute}: ${sub.name} (${sub.role === "header" ? p.header : p.heeler})${sub.countsForSubstitute ? ` · ${p.countsForSubstitute}` : ""}` : null,
  };
}
