import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listPublicEvents } from "@/lib/data/events";
import { absUrl } from "@/lib/seo";

const LANGS = ["es", "en"] as const;

// Una entrada por idioma, cada una apuntando a su par (hreflang).
function entry(path: string, lastModified?: string, changeFrequency?: "daily" | "weekly" | "monthly" | "yearly", priority?: number): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LANGS.map((l) => [l, absUrl(`/${l}${path}`)]));
  return LANGS.map((l) => ({ url: absUrl(`/${l}${path}`), ...(lastModified ? { lastModified } : {}), changeFrequency, priority, alternates: { languages } }));
}

// Mapa del sitio (KIN-617): portada, ranking, legales, cada evento público y cada serie con eventos públicos.
// Los perfiles de lazadores NO van aquí a propósito (son datos de personas; decisión pendiente).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Se arma al pedirlo, no al compilar (así el build no necesita conectarse a la base).
  await connection();
  const events = await listPublicEvents();
  const series = new Map<string, string>(); // slug de la serie -> última modificación de sus eventos
  for (const e of events) if (e.series && (series.get(e.series.slug) ?? "") < e.updatedAt) series.set(e.series.slug, e.updatedAt);
  const newest = events.reduce((max, e) => (e.updatedAt > max ? e.updatedAt : max), "");
  return [
    ...entry("", newest || undefined, "daily", 1),
    ...entry("/participantes", undefined, "daily", 0.5),
    ...entry("/terminos", undefined, "yearly", 0.2),
    ...entry("/privacidad", undefined, "yearly", 0.2),
    ...events.flatMap((e) => entry(`/eventos/${e.id}`, e.updatedAt, e.status === "publicado" ? "daily" : "monthly", e.status === "publicado" ? 0.9 : 0.6)),
    ...[...series].flatMap(([slug, updated]) => entry(`/series/${slug}`, updated, "weekly", 0.7)),
  ];
}
