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

/** Tipos de sorteo de un evento casual (KIN-648). */
export type DrawType = "round_robin" | "lazada_sorteada";
export const DRAW_TYPES: readonly DrawType[] = ["round_robin", "lazada_sorteada"];

export type PaymentStatus = "pendiente" | "pagado" | "reembolsado";
export type PaymentMethod = "efectivo" | "transferencia" | "stripe";

/** Serie de la web a la que pertenece un evento (KIN-625). Datos públicos de la serie; nunca su plantilla ni instrucciones de pago. */
export type EventSeriesRef = { id: string; slug: string | null; name: string; start_date: string; end_date: string };

/** Arena del catálogo del organizador a la que está enlazado el evento (KIN-751). Solo id, nombre y ciudad; las notas internas no salen. */
export type EventArenaRef = { id: string; name: string; city: string | null };

export type WaitlistRow = {
  id: string;
  roper_global_id: string;
  name: string;
  category_id: string | null;
  category: string | null;
  role: "header" | "heeler" | null;
  packages: number;
  /** Cuándo se anotó (ISO). */
  joined_at: string;
};

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
  /** Rating máximo para inscribirse (KIN-638). La función SQL no lo trae: la ruta lo agrega. */
  max_roper_rating?: number | null;
  /** Tipo de sorteo (KIN-649). La función SQL no lo trae: la ruta lo agrega. Una web anterior no lo manda: se entiende `round_robin`. */
  draw_type?: DrawType;
  /** Tiros que trae un paquete en Lazada Sorteada (KIN-649). `null` fuera de ese tipo o mientras no se define. La ruta lo agrega. */
  lazada_shots_per_package?: number | null;
  /** Rondas del evento (KIN-655), 1 a 10; `null` = el organizador aún no las define. La ruta lo agrega. */
  rounds?: number | null;
  /** Cupo por lado (KIN-775): tope de cabeceros y de pialadores; `null` = ese lado no tiene tope propio. Cada uno es <= `capacity`. La ruta lo agrega. */
  capacity_headers?: number | null;
  capacity_heelers?: number | null;
  /** Hora del evento (KIN-778), `HH:MM` o `HH:MM:SS` tal como la entrega la base; `null` = sin hora. La ruta lo agrega. */
  event_time?: string | null;
  /** Si la última de las `rounds` es el short-go (KIN-777). Ausente (web anterior) = `true`. La ruta lo agrega. */
  short_go?: boolean | null;
  /** Rating máximo de la SUMA de un equipo (KIN-649); `null` = sin tope. La ruta lo agrega. */
  max_team_rating?: number | null;
  /** Serie del evento (KIN-625). La función SQL no la trae: la ruta la agrega. `null`/ausente = evento suelto. */
  series?: EventSeriesRef | null;
  /** Arena del evento (KIN-751). La función SQL no la trae: la ruta la agrega. `null`/ausente = el evento no está enlazado a una arena. */
  arena?: EventArenaRef | null;
  /** Lista de espera del evento (KIN-726), en orden de llegada. La función SQL no la trae: la ruta la agrega. No ocupa cupo ni cuenta como inscrita. */
  waitlist?: WaitlistRow[];
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
    role: "header" | "heeler" | null;
    /** Paquetes de tiros que compró (KIN-649). 1 fuera de Lazada Sorteada. */
    packages?: number;
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
      // KIN-775: `capacity` sigue siendo el total. El tope de cada lado es opcional (`null` = sin tope por lado, también en una web anterior) y cada uno es <= `capacity`. La app los trata como espejo de solo lectura.
      capacity_headers: row.capacity_headers === undefined || row.capacity_headers === null ? null : Number(row.capacity_headers),
      capacity_heelers: row.capacity_heelers === undefined || row.capacity_heelers === null ? null : Number(row.capacity_heelers),
      max_roper_rating: row.max_roper_rating === undefined || row.max_roper_rating === null ? null : Number(row.max_roper_rating),
      draw_type: row.draw_type ?? "round_robin",
      lazada_shots_per_package: row.lazada_shots_per_package === undefined || row.lazada_shots_per_package === null ? null : Number(row.lazada_shots_per_package),
      // KIN-776: el tope por equipo solo aplica a Lazada Sorteada; en Round Robin viaja `null` aunque la base tenga un valor de antes.
      max_team_rating: row.draw_type === "lazada_sorteada" && row.max_team_rating !== undefined && row.max_team_rating !== null ? Number(row.max_team_rating) : null,
      rounds: row.rounds === undefined || row.rounds === null ? null : Number(row.rounds),
      // KIN-777: `rounds` es el TOTAL e incluye el short-go (3 = 2 normales + 1 short-go). `short_go` va siempre explícito; sin dato (web anterior o fila vieja) es `true`, como en la app.
      short_go: row.short_go !== false,
      // KIN-778: hora local del evento ("HH:MM", sin zona horaria), opcional. La app la guarda como espejo de solo lectura. La zona horaria no se manda: es un dato interno de la web.
      event_time: typeof row.event_time === "string" && /^\d{2}:\d{2}/.test(row.event_time) ? row.event_time.slice(0, 5) : null,
      series: row.series ? { id: row.series.id, slug: row.series.slug ?? "", name: row.series.name, start_date: row.series.start_date, end_date: row.series.end_date } : null,
      arena: row.arena ? { id: row.arena.id, name: row.arena.name, city: row.arena.city ?? "" } : null,
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
        role: r.role ?? null,
        packages: r.packages ?? 1,
      })),
      // KIN-726: quienes esperan lugar, en orden de llegada. `position` es su lugar en la fila del evento (1 = el siguiente). No cuentan como inscritos.
      waitlist: (row.waitlist ?? []).map((w, i) => ({
        id: w.id,
        roper_global_id: w.roper_global_id,
        name: w.name,
        category_id: w.category_id,
        category: w.category,
        role: w.role ?? null,
        packages: w.packages ?? 1,
        position: i + 1,
        joined_at: new Date(w.joined_at).toISOString(),
      })),
    })),
    // El cursor guarda `changed_at` TAL COMO lo entrega la base (con microsegundos): pasarlo por Date lo truncaría a milisegundos y la
    // misma fila volvería a salir al inicio de la página siguiente.
    next_cursor: hasMore && last ? encodeCursor({ changedAt: last.changed_at, id: last.id, snapshot }) : null,
    generated_at: snapshot,
  };
}
