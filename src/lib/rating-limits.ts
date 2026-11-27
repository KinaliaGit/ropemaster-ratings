// Qué límites de rating aplican a cada tipo de sorteo (KIN-776). El rating máximo por persona aplica siempre; el rating máximo del EQUIPO (suma de cabecero y pialador)
// solo en Lazada Sorteada, donde los equipos se arman al sortear. Un valor que no aplica nunca limita nada: no se pide, no se guarda y no viaja a la app.
// Sin dependencias para probarlo con `node --test` (ver tests/rating-limits.test.mjs).

export type DrawKind = "round_robin" | "lazada_sorteada";

/** ¿Aplica el rating máximo por equipo a este tipo de sorteo? */
export const teamLimitApplies = (drawType: DrawKind | null | undefined): boolean => drawType === "lazada_sorteada";

/** El tope por equipo si aplica; `null` si no (aunque la base tenga un valor guardado de antes). */
export function applicableTeamLimit(drawType: DrawKind | null | undefined, teamLimit: number | null | undefined): number | null {
  return teamLimitApplies(drawType) && teamLimit !== null && teamLimit !== undefined ? teamLimit : null;
}
