// Enlace corto y legible a partir de un nombre (sin acentos, minúsculas, con un sufijo al azar para que no se repita).
export function slugify(name: string, fallback = "evento") {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || fallback;
  return `${base}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
}
