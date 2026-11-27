// Rondas y short-go del evento (KIN-777). `rounds` es el TOTAL de rondas e INCLUYE el short-go: 3 rondas con short-go son 2 normales + 1 short-go (no se agrega una cuarta).
// `shortGo` dice si la última ronda es el short-go. Es la misma regla de la app (`event.rounds` + `event.short_go`). Un evento sin `shortGo` guardado se entiende con short-go,
// como los eventos de la app. Sin dependencias para probarlo con `node --test` (ver tests/event-rounds.test.mjs).

export const MAX_ROUNDS = 10;
/** Con short-go, al menos una ronda normal más el short-go. */
export const MIN_ROUNDS_WITH_SHORT_GO = 2;

export type RoundsResult = { ok: true; rounds: number | null; shortGo: boolean } | { ok: false; error: "invalidRounds" | "shortGoMin" };

/** El short-go viaja como "true" o "false"; ausente o cualquier otra cosa es activo (el valor por defecto de la app). */
export const parseShortGo = (value: unknown): boolean => value !== "false";

/** Rondas escritas en el formulario: vacío = sin definir (la app usa su valor por defecto); si no, un entero de 1 a 10 y, con short-go, de al menos 2. */
export function parseRounds(roundsRaw: unknown, shortGoRaw: unknown): RoundsResult {
  const shortGo = parseShortGo(shortGoRaw);
  const raw = typeof roundsRaw === "string" ? roundsRaw.trim() : "";
  if (raw === "") return { ok: true, rounds: null, shortGo };
  if (!/^\d+$/.test(raw)) return { ok: false, error: "invalidRounds" };
  const rounds = Number(raw);
  if (rounds < 1 || rounds > MAX_ROUNDS) return { ok: false, error: "invalidRounds" };
  if (shortGo && rounds < MIN_ROUNDS_WITH_SHORT_GO) return { ok: false, error: "shortGoMin" };
  return { ok: true, rounds, shortGo };
}

/** Rondas normales y si hay short-go, a partir del total guardado. `null` si el evento no define rondas. Un evento de una sola ronda no tiene short-go aparte. */
export function splitRounds(rounds: number | null | undefined, shortGo: boolean | null | undefined): { regular: number; shortGo: boolean } | null {
  if (rounds === null || rounds === undefined) return null;
  const hasShortGo = shortGo !== false && rounds >= MIN_ROUNDS_WITH_SHORT_GO;
  return { regular: hasShortGo ? rounds - 1 : rounds, shortGo: hasShortGo };
}

/** Texto corto de las rondas del evento: "2 rondas + short-go" o "3 rondas". */
export function formatRounds(rounds: number | null | undefined, shortGo: boolean | null | undefined, roundsWord: string, shortGoWord: string): string {
  const split = splitRounds(rounds, shortGo);
  if (!split) return "";
  return `${split.regular} ${roundsWord}${split.shortGo ? ` + ${shortGoWord}` : ""}`;
}
