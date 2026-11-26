// Lógica pura del directorio de lazadores (KIN-768): validar lo que pide el navegador, preparar la búsqueda y armar las páginas.
// Sin dependencias de Next para poder probarla con `node --test` (ver tests/roper-directory.test.mjs).

export const DIRECTORY_PAGE_SIZE = 60;

export type DirectoryRole = "header" | "heeler";
export type DirectoryQuery = { discipline: string; search: string; role: DirectoryRole | null; offset: number };
export type ParsedDirectoryQuery = { ok: true; value: DirectoryQuery } | { ok: false; error: string };

/** Lee `?discipline=&q=&role=&after=` (`after` = cuántas personas ya se recibieron). */
export function parseDirectoryQuery(url: URL, active: readonly string[]): ParsedDirectoryQuery {
  const get = (k: string) => url.searchParams.get(k) || null;
  const discipline = get("discipline");
  if (discipline === null || !active.includes(discipline)) return { ok: false, error: "Modalidad no válida" };
  const role = get("role");
  if (role !== null && role !== "header" && role !== "heeler") return { ok: false, error: "Posición no válida" };
  const after = get("after");
  if (after !== null && !/^[1-9]\d{0,6}$/.test(after)) return { ok: false, error: "after no es válido" };
  return { ok: true, value: { discipline, search: (get("q") ?? "").slice(0, 60), role, offset: after === null ? 0 : Number(after) } };
}

/**
 * La búsqueda lista para la base: un ID corto («rm-42», «RM0042») o hasta 5 palabras. Solo quedan letras (con sus acentos), números,
 * apóstrofos y guiones: así nada de lo escrito se interpreta como parte del filtro.
 */
export function directorySearch(raw: string): { rm: number } | { words: string[] } {
  const text = raw.trim().toLowerCase();
  const rm = /^rm-?(\d{1,15})$/.exec(text);
  if (rm) return { rm: Number(rm[1]) };
  const words = text.normalize("NFC").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, "")).filter(Boolean);
  return { words: [...new Set(words)].slice(0, 5) };
}

// Cada letra encuentra también sus versiones con acento: «rodri» halla «Rodríguez» y «oscar», «Óscar».
const ACCENTS = ["aáàâä", "eéèêë", "iíìîï", "oóòôö", "uúùûü", "nñ"];

/** Expresión «una palabra del nombre empieza así», sin distinguir acentos (se usa sin distinguir mayúsculas). La palabra ya viene limpia. */
export const wordStartPattern = (word: string) =>
  `(^| )${[...word].map((c) => { const group = ACCENTS.find((g) => g.includes(c)); return group ? `[${group}${group.toUpperCase()}]` : c; }).join("")}`;

export type DirectoryRow = { id: string; name: string; avatarPath: string | null; rating: number; role: string | null };
export type DirectoryPage = { rows: DirectoryRow[]; next: number | null };
export type DirectoryDbRow = { id: string; full_name: string; avatar_path: string | null; primary_role: string | null; roper_ratings: { rating: number | string }[] | null };

/** Se pidió una fila de más: si llegó, hay otra página. Quien aún no tiene número parte del inicial. */
export function toDirectoryPage(data: DirectoryDbRow[], limit: number, offset: number, initial: number): DirectoryPage {
  const rows = data.slice(0, limit).map((r) => ({ id: r.id, name: r.full_name, avatarPath: r.avatar_path, rating: Number(r.roper_ratings?.[0]?.rating ?? initial), role: r.primary_role }));
  return { rows, next: data.length > limit ? offset + rows.length : null };
}
