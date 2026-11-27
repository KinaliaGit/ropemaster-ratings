// Cupo del evento (KIN-774). El cupo es OPCIONAL: sin límite se guarda vacío (`null`), igual que los eventos que llegan de la app. Con límite es un entero mayor que 0.
// Sin dependencias para probarlo con `node --test` (ver tests/event-capacity.test.mjs).

export const MAX_CAPACITY = 100000;

/** Cupo escrito en el formulario: `null` si está vacío (sin límite), el entero si es válido, "invalid" si es otra cosa (0, negativo, decimal, texto o demasiado grande). */
export function parseCapacity(value: unknown): number | null | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return "invalid";
  const n = Number(raw);
  return n > 0 && n <= MAX_CAPACITY ? n : "invalid";
}
