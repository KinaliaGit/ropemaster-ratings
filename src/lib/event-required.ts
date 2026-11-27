// Qué le falta o qué está mal en lo básico de un evento, y cómo contar un error de la base (KIN-774). Antes todo caía en un solo aviso genérico («faltan datos o hay valores inválidos»);
// ahora cada problema tiene su propio código y mensaje, y se devuelven todos juntos. Sin dependencias para probarlo con `node --test` (ver tests/event-required.test.mjs).

export type BasicsInput = { name: string; date: string; city: string; venue: string; categories: number; disciplines: number };
export type BasicsError = "nameRequired" | "dateInvalid" | "arenaRequired" | "costRequired" | "disciplineRequired";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Lo obligatorio que falta o está mal, todo junto y en el orden del formulario. Vacío = todo en orden. */
export function missingBasics(e: BasicsInput): BasicsError[] {
  const problems: BasicsError[] = [];
  if (!e.name.trim()) problems.push("nameRequired");
  if (!DAY.test(e.date)) problems.push("dateInvalid");
  if (!e.city.trim() || !e.venue.trim()) problems.push("arenaRequired");
  if (e.categories < 1) problems.push("costRequired");
  if (e.disciplines < 1) problems.push("disciplineRequired");
  return problems;
}

/** Un error de la base al guardar. `schemaMissing` = la base no tiene todavía una columna que la web ya usa (faltan migraciones); lo demás es un fallo al guardar. */
export function dbErrorCode(error: { code?: string | null; message?: string | null } | null | undefined): "schemaMissing" | "saveFailed" {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return code === "PGRST204" || code === "42703" || /schema cache|column .* does not exist/i.test(message) ? "schemaMissing" : "saveFailed";
}
