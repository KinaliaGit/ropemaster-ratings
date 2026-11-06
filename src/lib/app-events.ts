// Lógica pura de `GET /api/app/eventos` (KIN-585): lectura de parámetros, cursor, versión del contrato y forma de la respuesta.
// Sin dependencias para poder probarla con `node --test` (ver tests/app-events.test.mjs). El contrato está en docs/SYNC_API.md.
//
// La respuesta lleva solo eventos `publicado` o `finalizado` del organizador del código. Cada evento que cambió se manda COMPLETO,
// con la lista vigente de sus inscritos: la app reemplaza lo que tenía de ese evento (así una cancelación se entiende sola).

export const CONTRACT_VERSION = 1;
export const PAGE_SIZE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type Cursor = { changedAt: string; id: string; snapshot: string };
export type EventsQuery = { since: string | null; cursor: Cursor | null };
export type Failure = { ok: false; status: 400 | 426; code: string; error: string };

/** Fecha ISO válida (normalizada a UTC) o null. */
export function parseIso(raw: string): string | null {
  if (!TIMESTAMP.test(raw.trim())) return null;
  const time = Date.parse(raw.trim());
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// El cursor es opaco para la app: guarda hasta dónde llegó (último cambio e id) y el corte de la consulta, para que todas las
// páginas de una misma descarga compartan `generated_at`.
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify({ c: cursor.changedAt, i: cursor.id, g: cursor.snapshot })).toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const data = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { c?: unknown; i?: unknown; g?: unknown };
    if (typeof data.c !== "string" || typeof data.g !== "string" || !isUuid(data.i)) return null;
    if (!TIMESTAMP.test(data.c) || !TIMESTAMP.test(data.g)) return null;
    return { changedAt: data.c, id: data.i, snapshot: data.g };
  } catch {
    return null;
  }
}

/**
 * La app puede declarar la versión del contrato que entiende con el encabezado `X-Contract-Version`. Si no lo manda se asume la
 * actual (las apps anteriores no lo mandan). Una versión que la web ya no acepta es 426, igual que en la subida de resultados.
 */
export function checkVersion(header: string | null): Failure | null {
  if (header === null || header.trim() === "") return null;
  const asked = Number(header.trim());
  if (!Number.isInteger(asked) || asked < 1) {
    return { ok: false, status: 400, code: "invalid_field", error: "X-Contract-Version debe ser un entero." };
  }
  if (asked !== CONTRACT_VERSION) {
    return { ok: false, status: 426, code: "version_unsupported", error: `Esta web habla la versión ${CONTRACT_VERSION} del contrato. Actualiza la app.` };
  }
  return null;
}

export function parseEventsQuery(url: URL): { ok: true; value: EventsQuery } | Failure {
  const sinceRaw = url.searchParams.get("since");
  let since: string | null = null;
  if (sinceRaw) {
    since = parseIso(sinceRaw);
    if (!since) return { ok: false, status: 400, code: "invalid_field", error: "since no es una fecha válida (ISO-8601)." };
  }
  const cursorRaw = url.searchParams.get("cursor");
  let cursor: Cursor | null = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return { ok: false, status: 400, code: "invalid_field", error: "cursor no es válido." };
  }
  return { ok: true, value: { since, cursor } };
}

export type PaymentStatus = "pendiente" | "pagado" | "reembolsado";
export type PaymentMethod = "efectivo" | "transferencia" | "stripe";

export type EventRow = {
  id: string;
  slug: string | null;
  name: string;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  description: string | null;
  disciplines: string[] | null;
  capacity: number | null;
  status: string;
  changed_at: string;
  categories: { id: string; name: string; fee_cents: number }[] | null;
  registrations: {
    id: string;
    roper_global_id: string;
    name: string;
    category_id: string | null;
    category: string | null;
    payment_status: PaymentStatus;
    amount_cents: number;
    payment_method: PaymentMethod | null;
  }[] | null;
};

/** Respuesta de una página. Nunca incluye correo, celular ni ids de cuenta de los inscritos. */
export function buildEventsPage(rows: EventRow[], organizer: string, snapshot: string) {
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  return {
    contract_version: CONTRACT_VERSION,
    organizer,
    events: page.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      date: row.event_date ?? "",
      city: row.city ?? "",
      venue: row.venue ?? "",
      status: row.status,
      disciplines: row.disciplines ?? [],
      capacity: row.capacity,
      description: row.description ?? "",
      updated_at: new Date(row.changed_at).toISOString(),
      categories: (row.categories ?? []).map((c) => ({ id: c.id, name: c.name, fee_cents: c.fee_cents })),
      registrations: (row.registrations ?? []).map((r) => ({
        id: r.id,
        roper_global_id: r.roper_global_id,
        name: r.name,
        category_id: r.category_id,
        category: r.category,
        payment_status: r.payment_status,
        amount_cents: r.amount_cents,
        payment_method: r.payment_method,
      })),
    })),
    // El cursor guarda `changed_at` TAL COMO lo entrega la base (con microsegundos): pasarlo por Date lo truncaría a milisegundos y la
    // misma fila volvería a salir al inicio de la página siguiente.
    next_cursor: hasMore && last ? encodeCursor({ changedAt: last.changed_at, id: last.id, snapshot }) : null,
    generated_at: snapshot,
  };
}
