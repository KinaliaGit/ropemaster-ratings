// Póster del evento (KIN-767): decide QUÉ lleva el póster y con qué tamaño de letra, a partir de los datos del evento.
// Solo lógica pura y sin dependencias (se prueba con `node --test`, ver tests/event-poster.test.mjs); el dibujo vive en event-poster-image.tsx.
// Los campos opcionales que faltan no dejan huecos: simplemente no aparecen (una celda sin contenido se omite y las demás se reacomodan).

export type PosterLang = "es" | "en";

/** Medidas del lienzo (px). El boceto aprobado es 540 x 675; el PNG sale al doble (4:5, 1080 x 1350). */
export const POSTER = { width: 1080, height: 1350, padX: 68, nameFont: "Anton" } as const;
const CONTENT_WIDTH = POSTER.width - POSTER.padX * 2;

export type PosterLabels = {
  organizer: string; signUp: string; modality: string; format: string; registration: string; capacity: string;
  seats: string; headers: string; heelers: string; ratingMax: string; teamMax: string; perPackage: string; free: string;
  shotsPerPackage: string; closesOn: string; more: (n: number) => string;
  roundRobin: string; lazadaSorteada: string; roundsWord: string; shortGoWord: string;
};

export type PosterEvent = {
  name: string; date: string; time: string | null; venue: string; city: string;
  disciplineLabel: string; drawType: "round_robin" | "lazada_sorteada"; shotsPerPackage: number | null;
  rounds: number | null; shortGo: boolean;
  categories: { name: string; fee: number }[];
  capacity: number; capacityHeaders: number | null; capacityHeelers: number | null;
  maxRoperRating: number | null; maxTeamRating: number | null;
  registrationClosesAt: string | null; timezone: string;
  series: string | null; description: string; organizer: string;
};

/** Una línea de una celda: el texto fuerte y, a su lado, uno apagado. `size` manda la letra; `accent` lo pinta de naranja. */
export type PosterRow = { strong?: string; muted?: string; size: "big" | "normal" | "small"; accent?: boolean };
export type PosterCell = { key: "modality" | "format" | "registration" | "capacity"; label: string; rows: PosterRow[] };

export type PosterModel = {
  series: string | null;
  day: string; monthYear: string; whenLine: string; place: string | null;
  name: { text: string; size: number };
  cellRows: PosterCell[][]; // celdas en filas de 2
  closing: string | null; description: string | null;
  organizer: string;
};

const MAX_CATEGORIES = 4;
const MAX_SERIES_CHARS = 34;
const MAX_DESCRIPTION_CHARS = 140;

/** Corta un texto sin partir palabras y añade "…". Texto corto se devuelve igual. */
export function cutText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** "12:00" -> "12:00 PM". Lo que no es una hora válida (HH:MM) no se muestra. */
export function clockLabel(time: string | null | undefined): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

const intlLocale = (lang: PosterLang) => (lang === "es" ? "es-MX" : "en-US");
const capitalize = (s: string, lang: PosterLang) => (s ? s.charAt(0).toLocaleUpperCase(intlLocale(lang)) + s.slice(1) : s);
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function money(n: number, lang: PosterLang): string {
  return new Intl.NumberFormat(intlLocale(lang), { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(n);
}

/** Día (YYYY-MM-DD) en que cae un instante en la zona del evento; null si no es una fecha válida. */
function dayInZone(iso: string, timeZone: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  }
}

// --- Tamaño del nombre -------------------------------------------------------------------------------------------------------------------------------------------
// Satori (el motor de ImageResponse) no ajusta la letra solo, así que el tamaño se elige aquí con una estimación del ancho de Anton (en mayúsculas). Es conservadora:
// mejor quedar un poco chico que cortar el nombre. La prueba del póster (tests/event-poster.test.mjs) fija la regla.
const NAME_SIZES = [172, 150, 132, 116, 104, 92, 82, 72, 64, 56, 50, 44] as const;
const NAME_LINE_HEIGHT = 1.02;
const ANTON_EM = 0.5; // ancho medio de una letra mayúscula, en em (más ancha que la real a propósito)
const ANTON_SPACE_EM = 0.26;

const wordWidth = (word: string, size: number) => word.length * ANTON_EM * size;

/** Líneas que ocupa `text` con letra de `size`; `Infinity` si una palabra sola no cabe en el ancho (se saldría del póster). */
export function nameLines(text: string, size: number, width: number = CONTENT_WIDTH): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(" ").filter(Boolean)) {
    const w = wordWidth(word, size);
    if (w > width) return Infinity;
    const needed = used === 0 ? w : used + ANTON_SPACE_EM * size + w;
    if (needed > width) { lines += 1; used = w; } else { used = needed; }
  }
  return lines;
}

/** Elige la letra más grande con la que el nombre cabe en `maxHeight`. Si ni con la más chica cabe, lo acorta con "…" (nunca se corta a media palabra ni se desborda). */
export function fitName(name: string, maxHeight: number, lang: PosterLang = "es"): { text: string; size: number } {
  const text = name.replace(/\s+/g, " ").trim().toLocaleUpperCase(intlLocale(lang));
  for (const size of NAME_SIZES) {
    if (nameLines(text, size) * size * NAME_LINE_HEIGHT <= maxHeight) return { text, size };
  }
  const size = NAME_SIZES[NAME_SIZES.length - 1];
  let words = text.split(" ").filter(Boolean);
  while (words.length > 1) {
    words = words.slice(0, -1);
    const candidate = `${words.join(" ")}…`;
    if (nameLines(candidate, size) * size * NAME_LINE_HEIGHT <= maxHeight) return { text: candidate, size };
  }
  // Una sola palabra gigante: se recorta por letras.
  const maxChars = Math.max(3, Math.floor(CONTENT_WIDTH / (ANTON_EM * size)) - 1);
  return { text: `${text.slice(0, maxChars)}…`, size };
}

// --- Alturas (estimadas) de lo que rodea al nombre -----------------------------------------------------------------------------------------------------------
// Fijas: margen superior + cabecera + bloque de fecha + pie. Las demás dependen de qué datos hay.
const FIXED_HEIGHT = 56 + 92 + 44 + 210 + 34 + 240; // el pie con el nombre del organizador en dos líneas es más alto: se deja margen
const ROW_HEIGHT = { big: 52, normal: 38, small: 32 } as const;
const CELL_HEAD = 38;
const GRID_GAP = 24;
const GRID_TOP = 36;
const CLOSING_HEIGHT = 76;
const DESCRIPTION_HEIGHT = 92;
const MIN_NAME_HEIGHT = 230;

const cellHeight = (c: PosterCell) => CELL_HEAD + c.rows.reduce((s, r) => s + ROW_HEIGHT[r.size], 0);
const gridHeight = (rows: PosterCell[][]) => (rows.length === 0 ? 0 : GRID_TOP + rows.reduce((s, r) => s + Math.max(...r.map(cellHeight)), 0) + GRID_GAP * (rows.length - 1));

/** Todo lo que lleva el póster, ya formateado y con el tamaño de letra del nombre resuelto. */
export function buildPoster(e: PosterEvent, lang: PosterLang, l: PosterLabels): PosterModel {
  // Fecha
  const date = isDay(e.date) ? new Date(`${e.date}T00:00:00Z`) : null;
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(lang), { ...o, timeZone: "UTC" });
  const day = date ? String(date.getUTCDate()) : "–";
  const monthYear = date ? `${fmt({ month: "long" }).format(date).toLocaleUpperCase(intlLocale(lang))} ${date.getUTCFullYear()}` : "";
  const clock = clockLabel(e.time);
  const weekday = date ? capitalize(fmt({ weekday: "long" }).format(date), lang) : "";
  const whenLine = [weekday, clock].filter(Boolean).join(" · ");
  const place = [e.venue.trim(), e.city.trim()].filter(Boolean).join(", ") || null;

  // Celdas
  const cells: PosterCell[] = [];
  const draw = e.drawType === "lazada_sorteada" ? l.lazadaSorteada : l.roundRobin;
  const shots = e.drawType === "lazada_sorteada" && e.shotsPerPackage ? ` · ${e.shotsPerPackage} ${l.shotsPerPackage}` : "";
  cells.push({ key: "modality", label: l.modality, rows: [{ strong: e.disciplineLabel, size: "normal" }, { muted: `${draw}${shots}`, size: "small" }] });

  const roundsText = e.rounds === null ? "" : `${e.shortGo !== false && e.rounds >= 2 ? e.rounds - 1 : e.rounds} ${l.roundsWord}${e.shortGo !== false && e.rounds >= 2 ? ` + ${l.shortGoWord}` : ""}`;
  const ratings = [e.maxRoperRating !== null ? `${l.ratingMax} ${Number(e.maxRoperRating)}` : "", e.maxTeamRating !== null ? `${l.teamMax} ${Number(e.maxTeamRating)}` : ""].filter(Boolean).join(" · ");
  const formatRows: PosterRow[] = [];
  if (roundsText) formatRows.push({ strong: roundsText, size: "normal" });
  if (ratings) formatRows.push(roundsText ? { muted: ratings, size: "small" } : { strong: ratings, size: "normal" });
  if (formatRows.length > 0) cells.push({ key: "format", label: l.format, rows: formatRows });

  const cats = e.categories.filter((c) => c.name.trim() !== "");
  if (cats.length > 0) {
    const perPackage = e.drawType === "lazada_sorteada" ? `, ${l.perPackage}` : "";
    const rows: PosterRow[] = cats.slice(0, MAX_CATEGORIES).map((c, i) => ({ strong: c.fee > 0 ? money(c.fee, lang) : l.free, muted: `${cutText(c.name, 22)}${perPackage}`, size: i === 0 ? "big" : "normal", accent: i === 0 }));
    if (cats.length > MAX_CATEGORIES) rows.push({ muted: l.more(cats.length - MAX_CATEGORIES), size: "small" });
    cells.push({ key: "registration", label: l.registration, rows });
  }

  const sides = e.capacityHeaders !== null && e.capacityHeelers !== null ? `${e.capacityHeaders} ${l.headers} · ${e.capacityHeelers} ${l.heelers}` : "";
  const capRows: PosterRow[] = [];
  if (e.capacity > 0) capRows.push({ strong: String(e.capacity), muted: l.seats, size: "big" });
  if (sides) capRows.push({ muted: sides, size: "small" });
  if (capRows.length > 0) cells.push({ key: "capacity", label: l.capacity, rows: capRows });

  const cellRows: PosterCell[][] = [];
  for (let i = 0; i < cells.length; i += 2) cellRows.push(cells.slice(i, i + 2));

  // Cierre de inscripciones (solo el día; la hora no hace falta en un póster)
  let closing: string | null = null;
  const closeDay = e.registrationClosesAt ? dayInZone(e.registrationClosesAt, e.timezone) : null;
  if (closeDay && isDay(closeDay)) {
    const sameYear = date !== null && Number(closeDay.slice(0, 4)) === date.getUTCFullYear();
    const text = fmt(sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${closeDay}T00:00:00Z`));
    closing = `${l.closesOn} ${text}`;
  }

  let description: string | null = e.description.trim() ? cutText(e.description, MAX_DESCRIPTION_CHARS) : null;

  // Lo que sobra de alto es para el nombre. Si hay poco, la descripción es lo primero que se sacrifica.
  const spaceFor = (withDescription: boolean) => POSTER.height - FIXED_HEIGHT - gridHeight(cellRows) - (closing ? CLOSING_HEIGHT : 0) - (withDescription && description ? DESCRIPTION_HEIGHT : 0);
  let budget = spaceFor(true);
  if (budget < MIN_NAME_HEIGHT && description) { description = null; budget = spaceFor(false); }

  return {
    series: e.series && e.series.trim() ? cutText(e.series, MAX_SERIES_CHARS) : null,
    day, monthYear, whenLine, place,
    name: fitName(e.name, Math.max(budget, MIN_NAME_HEIGHT), lang),
    cellRows, closing, description,
    organizer: cutText(e.organizer, 60),
  };
}

// --- Logo del organizador (opcional, nunca se guarda) -------------------------------------------------------------------------------------------------------
/** El logo que llega con la petición: PNG o JPG ya reducido por el navegador. Se mira por sus bytes reales, no por lo que diga el nombre o el tipo. */
export const MAX_LOGO_BYTES = 400 * 1024;
export type LogoCheck = { ok: true; mime: "image/png" | "image/jpeg" } | { ok: false; reason: "empty" | "too_big" | "not_image" };

export function checkPosterLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, reason: "too_big" };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((b, i) => bytes[i] === b)) return { ok: true, mime: "image/png" };
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ok: true, mime: "image/jpeg" };
  return { ok: false, reason: "not_image" }; // SVG, GIF, WebP sin convertir, HTML, ejecutables disfrazados...
}
