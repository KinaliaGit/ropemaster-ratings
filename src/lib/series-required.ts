// Qué le falta o qué está mal en lo básico de una serie (KIN-798). Igual que en los eventos (event-required.ts): cada problema tiene su propio código y mensaje, y se devuelven todos juntos.
// Sin dependencias para probarlo con `node --test` (ver tests/series-required.test.mjs).

export type SeriesBasicsInput = { name: string; startDate: string; endDate: string; city: string; venue: string; categories: number };
export type SeriesBasicsError = "seriesNameRequired" | "seriesDatesInvalid" | "range" | "arenaRequired" | "costRequired";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Lo obligatorio que falta o está mal, todo junto y en el orden del formulario. Vacío = todo en orden. */
export function missingSeriesBasics(e: SeriesBasicsInput): SeriesBasicsError[] {
  const problems: SeriesBasicsError[] = [];
  if (e.name.trim().length < 2) problems.push("seriesNameRequired");
  const datesOk = DAY.test(e.startDate) && DAY.test(e.endDate);
  if (!datesOk) problems.push("seriesDatesInvalid");
  else if (e.endDate < e.startDate) problems.push("range");
  if (!e.city.trim() || !e.venue.trim()) problems.push("arenaRequired");
  if (e.categories < 1) problems.push("costRequired");
  return problems;
}
