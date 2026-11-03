import "server-only";
import { es, type Dict } from "@/dictionaries/es";
import { en } from "@/dictionaries/en";

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export const hasLocale = (l: string): l is Locale => (LOCALES as readonly string[]).includes(l);
const dictionaries: Record<Locale, Dict> = { es, en };
export const getDictionary = (lang: Locale): Dict => dictionaries[lang];

// Lee y valida el idioma de la ruta (404 si no existe).
export async function resolveLang(params: Promise<{ lang: string }>): Promise<Locale> {
  const { lang } = await params;
  if (!hasLocale(lang)) (await import("next/navigation")).notFound();
  return lang as Locale;
}
