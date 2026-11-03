// Enlaces a la página de Rope Master (Kinalia) según el idioma.
const BASE = "https://kinalia.com.mx";
export const productUrl = (lang: "es" | "en") => `${BASE}/${lang}/productos/ropemaster`;
export const licensesUrl = (lang: "es" | "en") => `${productUrl(lang)}#pricing`;
