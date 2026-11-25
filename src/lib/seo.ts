import type { Metadata } from "next";
import type { EventItem } from "@/lib/types";
import type { Lang } from "@/lib/format";
import { LEGAL } from "./legal.ts";

// SEO (KIN-617): dirección del sitio, canonical e idiomas por página, y datos estructurados (JSON-LD) para Google.

export const SITE_NAME = "Rope Master Ratings";
export const PUBLISHER = { name: "Rope Master (Kinalia)", url: "https://kinalia.com.mx" } as const;

// Dirección pública del sitio, sin diagonal final. En producción sale de NEXT_PUBLIC_SITE_URL (la misma que usa Stripe).
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
export const absUrl = (path: string) => `${siteOrigin()}${path}`;

// Canonical de la página en su idioma + versiones en los otros idiomas (hreflang). `path` empieza con "/" o es "" para la portada.
export function pageAlternates(lang: Lang, path = ""): NonNullable<Metadata["alternates"]> {
  return { canonical: `/${lang}${path}`, languages: { es: `/es${path}`, en: `/en${path}`, "x-default": `/es${path}` } };
}

// Páginas privadas o sin valor para buscadores (panel, cuenta, formularios): no se indexan, pero sí se pueden rastrear para que Google vea el `noindex`.
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };

const OG_LOCALE: Record<Lang, string> = { es: "es_MX", en: "en_US" };

// Open Graph + Twitter de una página (vista previa al compartir el enlace en WhatsApp, Facebook, X…).
export function socialMeta(opts: { lang: Lang; path: string; title: string; description: string; images?: string[]; type?: "website" | "article" }): Pick<Metadata, "openGraph" | "twitter"> {
  const images = opts.images?.length ? opts.images : [absUrl("/hero-roping.png")];
  return {
    openGraph: { type: opts.type ?? "website", siteName: SITE_NAME, locale: OG_LOCALE[opts.lang], url: `/${opts.lang}${opts.path}`, title: opts.title, description: opts.description, images },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description, images },
  };
}

// Recorta un texto largo a un resumen para `description` (Google muestra ~155 caracteres).
export function summarize(text: string, max = 155): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

// ---- JSON-LD ----

type Json = Record<string, unknown>;

// Organización que publica el sitio y sitio web (portada).
export function organizationJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: PUBLISHER.name,
    legalName: LEGAL.entity,
    url: PUBLISHER.url,
    logo: absUrl("/logo.png"),
    email: LEGAL.email,
  };
}
export function websiteJsonLd(lang: Lang, description: string): Json {
  return { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: absUrl(`/${lang}`), inLanguage: lang, description, publisher: { "@type": "Organization", name: PUBLISHER.name, url: PUBLISHER.url } };
}

// Evento (Google lo muestra como resultado enriquecido de eventos). Solo si el evento tiene fecha: sin `startDate` Google lo descarta.
// El organizador no tiene página pública: se describe como Organization con su nombre (sin inventar dirección web).
// `open`: las inscripciones están abiertas ahora (la página ya lo calcula con la fecha y el cupo).
export function eventJsonLd(e: EventItem, lang: Lang, description: string, open: boolean): Json | null {
  if (!e.date) return null;
  const url = absUrl(`/${lang}/eventos/${e.id}`);
  const images = [...new Set([e.cover, ...e.photos.map((p) => p.url)].filter((x): x is string => !!x))].slice(0, 6);
  const availability = open ? "https://schema.org/InStock" : e.status === "publicado" && e.enrolled >= e.capacity ? "https://schema.org/SoldOut" : null; // finalizado o aún sin abrir: sin ofertas
  const offers = availability
    ? e.categories.map((c) => ({
      "@type": "Offer", name: c.name, price: c.fee, priceCurrency: "MXN", availability, url: `${url}/inscribirse`,
      ...(e.registrationOpensAt ? { validFrom: e.registrationOpensAt } : {}),
    }))
    : [];
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: e.name,
    description,
    url,
    inLanguage: lang,
    startDate: e.date,
    endDate: e.date,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(e.venue || e.city ? { location: { "@type": "Place", name: e.venue || e.city, address: { "@type": "PostalAddress", ...(e.city ? { addressLocality: e.city } : {}), ...(e.venue ? { streetAddress: e.venue } : {}) } } } : {}),
    ...(images.length ? { image: images } : {}),
    ...(e.organizer ? { organizer: { "@type": "Organization", name: e.organizer } } : {}),
    ...(e.series ? { superEvent: { "@type": "EventSeries", name: e.series.name, url: absUrl(`/${lang}/series/${e.series.slug}`) } } : {}),
    ...(offers.length ? { offers } : {}),
  };
}

// Serie de eventos con sus fechas y los eventos que contiene.
export function seriesJsonLd(s: { id: string; name: string; description: string; startDate: string; endDate: string; organizer: string }, events: EventItem[], lang: Lang): Json {
  return {
    "@context": "https://schema.org",
    "@type": "EventSeries",
    name: s.name,
    url: absUrl(`/${lang}/series/${s.id}`),
    inLanguage: lang,
    startDate: s.startDate,
    endDate: s.endDate,
    ...(s.description ? { description: summarize(s.description, 300) } : {}),
    ...(s.organizer ? { organizer: { "@type": "Organization", name: s.organizer } } : {}),
    subEvent: events.filter((e) => e.date).map((e) => ({ "@type": "SportsEvent", name: e.name, startDate: e.date, url: absUrl(`/${lang}/eventos/${e.id}`) })),
  };
}

// Texto del JSON-LD listo para un <script>: se escapa "<" para que un nombre de evento no pueda cerrar la etiqueta (XSS).
export const jsonLdText = (data: Json | Json[]) => JSON.stringify(data).replace(/</g, "\\u003c");
