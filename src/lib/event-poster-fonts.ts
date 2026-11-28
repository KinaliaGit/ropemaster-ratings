import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Fuentes del póster (KIN-767). Anton (títulos) e Inter (texto), ambas con licencia OFL (ver src/assets/fonts/LICENSE-*.txt). ImageResponse solo acepta ttf, otf y woff;
// se leen una vez por instancia del servidor. La ruta literal con process.cwd() hace que Next incluya los archivos en el despliegue.
const dir = path.join(process.cwd(), "src", "assets", "fonts");

type PosterFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800; style: "normal" };
let cached: Promise<PosterFont[]> | null = null;

async function load(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(dir, file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// El logo de Rope Master (el mismo que usa la cabecera del sitio, public/logo.png) como data URI para dibujarlo en el póster.
let brandLogo: Promise<string> | null = null;
export function posterBrandLogo(): Promise<string> {
  brandLogo ??= readFile(path.join(process.cwd(), "public", "logo.png"))
    .then((buf) => `data:image/png;base64,${buf.toString("base64")}`)
    .catch((err) => { brandLogo = null; throw err; });
  return brandLogo;
}

export function posterFonts(): Promise<PosterFont[]> {
  cached ??= Promise.all([
    load("anton-latin-400-normal.woff"), load("inter-latin-500-normal.woff"), load("inter-latin-700-normal.woff"), load("inter-latin-800-normal.woff"),
  ]).then(([anton, i500, i700, i800]) => [
    { name: "Anton", data: anton, weight: 400, style: "normal" },
    { name: "Inter", data: i500, weight: 500, style: "normal" },
    { name: "Inter", data: i700, weight: 700, style: "normal" },
    { name: "Inter", data: i800, weight: 800, style: "normal" },
  ] as PosterFont[]).catch((err) => { cached = null; throw err; });
  return cached;
}
