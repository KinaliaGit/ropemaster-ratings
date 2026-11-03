// Modalidades (modos de juego). Hoy solo Lazo está activo en la web; Barriles ya está previsto.
// Para activar una nueva basta con poner active: true (y sus textos ya están en los diccionarios es/en).
// Cada participante tiene un rating POR modalidad.
export type DisciplineId = "lazo" | "barriles";

export const DISCIPLINES = [
  { id: "lazo", active: true },
  { id: "barriles", active: false },
] as const;

export const ACTIVE_DISCIPLINES = DISCIPLINES.filter((d) => d.active);
export const DEFAULT_DISCIPLINE: DisciplineId = "lazo";
export const isActiveDiscipline = (id: unknown): id is DisciplineId => ACTIVE_DISCIPLINES.some((d) => d.id === id);
