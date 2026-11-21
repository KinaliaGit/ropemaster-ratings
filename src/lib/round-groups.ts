// Agrupa los tiros de un lazador por ronda para mostrarlos como "Ronda 1" con sus tiros debajo, "Ronda 2" con los suyos, etc.
// Sin dependencias (solo un tipo) para poder probarlo con `node --test` (ver tests/round-groups.test.mjs).
import type { RoundItem } from "./results-view.ts";

export type RoundGroup = { key: string; title: string; items: RoundItem[] };

/** Junta los tiros consecutivos de una misma ronda. `toRoundItems` ya los entrega ordenados por etapa y ronda, así que basta con mirar al anterior. */
export function groupRoundItems(items: RoundItem[]): RoundGroup[] {
  const groups: RoundGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.group) last.items.push(item);
    else groups.push({ key: item.group, title: item.title, items: [item] });
  }
  return groups;
}
