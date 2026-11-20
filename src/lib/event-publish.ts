// Qué le falta a un evento para poder publicarse (KIN-659). Un evento subido desde la app nace como borrador con ciudad vacía y sin cupo:
// se exigen los mismos datos que pide el formulario de crear/editar. Sin dependencias para probarlo con `node --test`.

export type PublishCheckInput = { city: string | null; venue: string | null; capacity: number | null; categories: number };
export type MissingField = "city" | "venue" | "capacity" | "categories";

export function missingForPublish(e: PublishCheckInput): MissingField[] {
  const missing: MissingField[] = [];
  if (!e.city?.trim()) missing.push("city");
  if (!e.venue?.trim()) missing.push("venue");
  if (!(typeof e.capacity === "number" && e.capacity > 0)) missing.push("capacity");
  if (e.categories < 1) missing.push("categories");
  return missing;
}

const FIELDS: readonly MissingField[] = ["city", "venue", "capacity", "categories"];
/** Lee la lista `?faltan=city,capacity` del enlace, ignorando lo desconocido. */
export function parseMissing(value: unknown): MissingField[] {
  if (typeof value !== "string") return [];
  return value.split(",").filter((x): x is MissingField => (FIELDS as readonly string[]).includes(x));
}
