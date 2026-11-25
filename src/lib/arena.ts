// Arenas (KIN-751). La llave de comparación es la misma que calcula la base (private.arena_key): "Arena X", "arena  x." y "ARENA X" son la
// misma arena. Se usa para agrupar y filtrar lo que ya se muestra en pantalla; el catálogo del organizador vive en la tabla `arenas`.

const ACCENTS: Record<string, string> = { á: "a", à: "a", ä: "a", â: "a", é: "e", è: "e", ë: "e", ê: "e", í: "i", ì: "i", ï: "i", î: "i", ó: "o", ò: "o", ö: "o", ô: "o", ú: "u", ù: "u", ü: "u", û: "u", ñ: "n", ç: "c" };

export function cleanArenaName(place: string | null | undefined): string {
  return (place ?? "").replace(/\s+/g, " ").trim();
}

export function arenaKey(place: string | null | undefined): string {
  return cleanArenaName(place).toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => ACCENTS[c] ?? c).replace(/[^a-z0-9]+/g, " ").trim();
}

export type ArenaOption = { key: string; name: string; count: number };

// Arenas distintas que hay en una lista de lugares, sin duplicados por escritura: cada una lleva la escritura más repetida (si empatan, la
// primera que apareció) y cuántos lugares la usan. Orden alfabético.
export function collectArenas(places: ReadonlyArray<string | null | undefined>): ArenaOption[] {
  const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const place of places) {
    const name = cleanArenaName(place);
    const key = arenaKey(name);
    if (!key) continue;
    const g = groups.get(key) ?? { spellings: new Map<string, number>(), count: 0 };
    g.count += 1;
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + 1);
    groups.set(key, g);
  }
  const options: ArenaOption[] = [];
  for (const [key, g] of groups) {
    let best = "", bestUses = 0;
    for (const [spelling, uses] of g.spellings) if (uses > bestUses) { best = spelling; bestUses = uses; }
    options.push({ key, name: best, count: g.count });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// Filtro por arena en la URL (?arena=<llave>): solo se acepta una llave válida (letras y números separados por espacios).
export function parseArenaParam(v: string | string[] | undefined): string {
  const raw = typeof v === "string" ? v.trim().slice(0, 120) : "";
  return /^[a-z0-9]+( [a-z0-9]+)*$/.test(raw) ? raw : "";
}
