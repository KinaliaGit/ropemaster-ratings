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

// Etiqueta de una ronda (Corrida extra, Ayuda) con su explicación: no es una penalización, es informativa y no cuenta para el resumen.
export type RoundTag = { label: string; hint: string };
export type RoundItem = { key: string; title: string; tags: RoundTag[]; value: string; penalty: string | null; note: string | null };

const STAGE_ORDER = { preliminary: 0, final: 1, tiebreak: 2 } as const;
const KIND_ORDER = { regular: 0, extra: 1, help: 2 } as const;

// Un lazador puede tener varias corridas en una misma ronda (se le asignan tiros). El contrato con la app no deja repetir una ronda
// `regular` en la misma etapa, así que las corridas adicionales llegan como `extra`. Por eso aquí se agrupan por etapa y ronda, se ordenan
// (la regular primero) y se numeran: "Ronda 1 · Corrida 2". El tag "Corrida extra" solo se pone cuando la ronda no tiene ninguna regular
// (una extra que está sola); las demás son simplemente otra corrida de esa ronda. "Ayuda" siempre se etiqueta.
export function toRoundItems(rounds: Round[], t: Dict): RoundItem[] {
  const p = t.people;
  const sorted = rounds.map((r, i) => ({ r, i })).sort((a, b) =>
    STAGE_ORDER[a.r.stage] - STAGE_ORDER[b.r.stage] || a.r.round - b.r.round || KIND_ORDER[a.r.kind] - KIND_ORDER[b.r.kind] || a.i - b.i);
  const groupKey = (r: Round) => `${r.stage}:${r.round}`;
  const size = new Map<string, number>();
  const hasRegular = new Set<string>();
  for (const { r } of sorted) {
    size.set(groupKey(r), (size.get(groupKey(r)) ?? 0) + 1);
    if (r.kind === "regular") hasRegular.add(groupKey(r));
  }
  const seen = new Map<string, number>();
  return sorted.map(({ r, i }) => {
    const g = groupKey(r);
    const n = (seen.get(g) ?? 0) + 1;
    seen.set(g, n);
    const stage = r.stage === "final" ? ` · ${p.roundFinal}` : r.stage === "tiebreak" ? ` · ${p.roundTiebreak}` : "";
    const run = (size.get(g) ?? 1) > 1 ? ` · ${p.run} ${n}` : "";
    const value = r.status === "completed" ? fmtTime(r.timeMs) : r.status === "no_time" ? p.noTime : p.dq;
    const sub = r.substitution;
    return {
      key: `${i}-${r.stage}-${r.kind}-${r.round}`, title: `${p.round} ${r.round}${stage}${run}`,
      tags: [...(r.kind === "extra" && !hasRegular.has(g) ? [{ label: p.extra, hint: p.extraHint }] : []), ...(r.kind === "help" ? [{ label: p.help, hint: p.helpHint }] : [])],
      value, penalty: r.status === "completed" && r.penaltyMs > 0 ? `+${fmtTime(r.penaltyMs)}` : null,
      note: sub ? `${p.substitute}: ${sub.name} (${sub.role === "header" ? p.header : p.heeler})${sub.countsForSubstitute ? ` · ${p.countsForSubstitute}` : ""}` : null,
    };
  });
}
