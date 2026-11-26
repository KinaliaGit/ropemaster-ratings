// Filtros de la pantalla general de pagos (KIN-754, arena en KIN-765). Viajan en la URL (?evento=&estado=&q=&arena=) y se validan igual al leerlos
// y al volver a ella después de marcar un pago: solo se aceptan estos cuatro parámetros y con valores conocidos.

export type PaymentFilters = { event: string | null; status: "pendiente" | "pagado" | "todos"; q: string; arena: string };

const SLUG = /^[a-z0-9-]{1,80}$/;
// Misma forma que `parseArenaParam` (src/lib/arena.ts): la llave de una arena son letras y números separados por espacios. Se repite aquí para que
// este archivo siga sin importar nada (las pruebas lo cargan directo con node).
const ARENA_KEY = /^[a-z0-9]+( [a-z0-9]+)*$/;

export function parsePaymentFilters(get: (key: string) => string | null | undefined): PaymentFilters {
  const event = get("evento") ?? "";
  const status = get("estado");
  const arena = (get("arena") ?? "").trim().slice(0, 120);
  return {
    event: SLUG.test(event) ? event : null,
    status: status === "pagado" || status === "todos" ? status : "pendiente",
    q: (get("q") ?? "").slice(0, 80),
    arena: ARENA_KEY.test(arena) ? arena : "",
  };
}

// Parámetros de URL de unos filtros (siempre con el estado, para que "pendiente" no dependa del valor por omisión).
export function paymentFiltersQuery(f: PaymentFilters): string {
  const p = new URLSearchParams();
  if (f.event) p.set("evento", f.event);
  if (f.arena) p.set("arena", f.arena);
  p.set("estado", f.status);
  if (f.q) p.set("q", f.q);
  return p.toString();
}

// Desde una cadena de consulta recibida por un formulario (no confiable) a la que se usa en la redirección.
export function sanitizePaymentsQuery(raw: string, error = false): string {
  const params = new URLSearchParams(raw);
  const f = parsePaymentFilters((k) => params.get(k));
  const out = new URLSearchParams(paymentFiltersQuery(f));
  if (error) out.set("pagoError", "1");
  return out.toString();
}
