// Búsqueda de personas por nombre: sin acentos ni mayúsculas y por INICIO de palabra.
// "a" encuentra a "Ana Estrada" (no a "Mateo"); "es" a "Estrada"; "ana es" a "Ana Estrada"; "villa" a "Mateo Villarreal".
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function matchesName(name: string, query: string) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const words = norm(name).split(/\s+/);
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}

/** Lo que llega en la URL como búsqueda: texto recortado y con tope. */
export const parseSearch = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : "");

/** KIN-768: evento por nombre, arena, ciudad o fecha («noviembre», «dic 2026»), con las mismas reglas que las personas. */
export function matchesEvent(e: { name: string; venue: string; city: string; date: string }, query: string) {
  const d = new Date(`${e.date}T00:00:00Z`);
  const dates = Number.isNaN(d.getTime()) ? [] : ["es-MX", "en-US"].flatMap((l) => (["long", "short"] as const).map((month) =>
    new Intl.DateTimeFormat(l, { day: "numeric", month, year: "numeric", timeZone: "UTC" }).format(d).replace(/[.,]/g, "")));
  return matchesName([e.name, e.venue, e.city, ...dates].filter(Boolean).join(" "), query);
}
