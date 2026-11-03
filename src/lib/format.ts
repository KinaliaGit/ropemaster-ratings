// Formato de fechas y dinero según el idioma. Sin leer la hora actual (compatible con el prerender).
export type Lang = "es" | "en";

export function fmtDate(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "es" ? "es-MX" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`));
}
export const mxn = (n: number, lang: Lang) =>
  new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US", { style: "currency", currency: "MXN", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(n) + " MXN";
export const withLang = (lang: Lang, path: string) => `/${lang}${path === "/" ? "" : path}`;
