// Búsqueda de personas por nombre: sin acentos ni mayúsculas y por INICIO de palabra.
// "a" encuentra a "Ana Estrada" (no a "Mateo"); "es" a "Estrada"; "ana es" a "Ana Estrada"; "villa" a "Mateo Villarreal".
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function matchesName(name: string, query: string) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const words = norm(name).split(/\s+/);
  return tokens.every((t) => words.some((w) => w.startsWith(t)));
}
