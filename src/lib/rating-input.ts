// Rating que un lazador declara al crear su cuenta (KIN-663): de 1 a 10 con un decimal ("4", "4.5" o "4,5").
// Es el rating de partida en la modalidad `lazo`; la base lo guarda en `roper_ratings` (ver la migración 0040) y la app lo recibe en `ratings.lazo.rating`.
// Sin dependencias para poder probarlo con `node --test` (ver tests/rating-input.test.mjs).

export const RATING_MIN = 1;
export const RATING_MAX = 10;

/** Número válido o null: acepta coma o punto, máximo un decimal y el rango 1 a 10. Cualquier otra cosa (vacío, letras, 2 decimales) es null. */
export function parseRatingInput(raw: unknown): number | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!/^\d{1,2}([.,]\d)?$/.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return value >= RATING_MIN && value <= RATING_MAX ? value : null;
}
