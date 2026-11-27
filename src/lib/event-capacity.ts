// Cupo del evento (KIN-774, KIN-775). El cupo es OPCIONAL: sin límite se guarda vacío (`null`), igual que los eventos que llegan de la app.
// Con límite hay tres formas de pedirlo (la persona elige una):
//   total   un solo número para todo el evento (solo para eventos que ya lo tenían así; el formulario ya no lo ofrece al crear)
//   eq      el mismo cupo para cada lado: N cabeceros y N pialadores (total = 2N)
//   per     un cupo distinto por lado (total = cabeceros + pialadores; 0 = nadie de ese lado)
// En `eq` y `per` el total se calcula solo, así el total y los lados nunca se contradicen. Sin dependencias para probarlo con `node --test` (ver tests/event-capacity.test.mjs).

export const MAX_CAPACITY = 100000;

/** Cupo escrito en el formulario: `null` si está vacío (sin límite), el entero si es válido, "invalid" si es otra cosa (0, negativo, decimal, texto o demasiado grande). */
export function parseCapacity(value: unknown): number | null | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return "invalid";
  const n = Number(raw);
  return n > 0 && n <= MAX_CAPACITY ? n : "invalid";
}

/** Cupo de un lado: entero desde 0 (nadie de ese lado). Vacío o cualquier otra cosa es "invalid": en `per` hay que escribir los dos lados. */
function parseSide(value: unknown): number | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(raw)) return "invalid";
  const n = Number(raw);
  return n <= MAX_CAPACITY ? n : "invalid";
}

export type CapacityMode = "none" | "total" | "eq" | "per";
export type CapacityResult =
  | { ok: true; mode: CapacityMode; capacity: number | null; headers: number | null; heelers: number | null }
  | { ok: false; error: "capacityInvalid" | "capacitySidesInvalid" };

/** Lee los campos de cupo del formulario (`capacityMode`, `capacity`, `capacityEach`, `capacityHeaders`, `capacityHeelers`) y devuelve el total y el tope de cada lado. */
export function parseCapacityFields(get: (name: string) => unknown): CapacityResult {
  const raw = get("capacityMode");
  const mode = typeof raw === "string" && raw !== "" ? raw : "none";
  if (mode === "none") return { ok: true, mode, capacity: null, headers: null, heelers: null };
  if (mode === "total") {
    const capacity = parseCapacity(get("capacity"));
    return capacity === "invalid" || capacity === null ? { ok: false, error: "capacityInvalid" } : { ok: true, mode, capacity, headers: null, heelers: null };
  }
  if (mode === "eq") {
    const each = parseCapacity(get("capacityEach"));
    return each === "invalid" || each === null ? { ok: false, error: "capacityInvalid" } : { ok: true, mode, capacity: each * 2, headers: each, heelers: each };
  }
  if (mode === "per") {
    const headers = parseSide(get("capacityHeaders"));
    const heelers = parseSide(get("capacityHeelers"));
    if (headers === "invalid" || heelers === "invalid" || headers + heelers === 0) return { ok: false, error: "capacitySidesInvalid" };
    return { ok: true, mode, capacity: headers + heelers, headers, heelers };
  }
  return { ok: false, error: "capacityInvalid" };
}

/** ¿El evento tiene límite de cupo? La capa de datos entrega 0 cuando no lo tiene. */
export const hasCapacityLimit = (capacity: number | null | undefined): boolean => typeof capacity === "number" && capacity > 0;

/** ¿Ya no caben más inscritos en total? Un evento sin límite nunca se llena. (Un lado puede llenarse antes: la base lo decide al inscribirse.) */
export const isFull = (enrolled: number, capacity: number | null | undefined): boolean => hasCapacityLimit(capacity) && enrolled >= (capacity as number);

/** "12/60" con límite, o solo "12" sin límite. */
export const fmtEnrolled = (enrolled: number, capacity: number | null | undefined): string => (hasCapacityLimit(capacity) ? `${enrolled}/${capacity}` : String(enrolled));
