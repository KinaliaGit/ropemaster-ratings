import test from "node:test";
import assert from "node:assert/strict";
import { eventJsonLd, jsonLdText, pageAlternates, seriesJsonLd, summarize } from "../src/lib/seo.ts";

const event = (over = {}) => ({
  id: "lazada-de-ano-nuevo", name: "Lazada de Año Nuevo", date: "2026-12-31", city: "Guadalajara", venue: "Lienzo Charro", description: "",
  organizer: "Asociación Los Altos", cover: "https://x.supabase.co/storage/v1/object/public/event-photos/a.jpg", photos: [{ id: "1", url: "https://x.supabase.co/storage/v1/object/public/event-photos/b.jpg" }],
  categories: [{ id: "c1", name: "Abierta", fee: 500 }], capacity: 40, enrolled: 10, status: "publicado", registrationOpensAt: null, registrationClosed: false,
  series: { slug: "temporada-2026", name: "Temporada 2026" }, ...over,
});

test("pageAlternates: canonical en su idioma, par en el otro y x-default en español", () => {
  assert.deepEqual(pageAlternates("en", "/eventos/a"), { canonical: "/en/eventos/a", languages: { es: "/es/eventos/a", en: "/en/eventos/a", "x-default": "/es/eventos/a" } });
  assert.equal(pageAlternates("es").canonical, "/es");
});

test("summarize: junta espacios y recorta sin partir palabras", () => {
  assert.equal(summarize("  hola \n  mundo "), "hola mundo");
  const out = summarize("palabra ".repeat(40), 30);
  assert.ok(out.length <= 30 && out.endsWith("…") && !out.includes("palabr…"), out);
});

test("jsonLdText: escapa '<' para que un nombre no pueda cerrar el script", () => {
  const text = jsonLdText({ name: "</script><img onerror=x>" });
  assert.ok(!text.includes("<"));
  assert.equal(JSON.parse(text).name, "</script><img onerror=x>");
});

test("eventJsonLd: evento abierto trae fecha, lugar, organizador, serie y una oferta por categoría", () => {
  const d = eventJsonLd(event(), "es", "Resumen", true);
  assert.equal(d["@type"], "SportsEvent");
  assert.equal(d.startDate, "2026-12-31");
  assert.equal(d.url, `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/es/eventos/lazada-de-ano-nuevo`);
  assert.deepEqual(d.organizer, { "@type": "Organization", name: "Asociación Los Altos" });
  assert.equal(d.location.address.addressLocality, "Guadalajara");
  assert.equal(d.superEvent.name, "Temporada 2026");
  assert.equal(d.image.length, 2);
  assert.equal(d.offers.length, 1);
  assert.deepEqual([d.offers[0].price, d.offers[0].priceCurrency, d.offers[0].availability], [500, "MXN", "https://schema.org/InStock"]);
});

test("eventJsonLd: sin fecha no hay datos estructurados (Google los descartaría)", () => {
  assert.equal(eventJsonLd(event({ date: "" }), "es", "x", true), null);
});

test("eventJsonLd: finalizado no ofrece inscripción; con cupo lleno aparece como agotado; sin organizador ni serie se omiten", () => {
  assert.equal(eventJsonLd(event({ status: "finalizado" }), "es", "x", false).offers, undefined);
  const full = eventJsonLd(event({ enrolled: 40 }), "es", "x", false);
  assert.equal(full.offers[0].availability, "https://schema.org/SoldOut");
  const bare = eventJsonLd(event({ organizer: "", series: null, venue: "", city: "", cover: undefined, photos: [] }), "es", "x", true);
  assert.deepEqual([bare.organizer, bare.superEvent, bare.location, bare.image], [undefined, undefined, undefined, undefined]);
});

test("seriesJsonLd: lista sus eventos con fecha", () => {
  const d = seriesJsonLd({ id: "temporada-2026", name: "Temporada 2026", description: "", startDate: "2026-01-01", endDate: "2026-12-31", organizer: "Los Altos" }, [event(), event({ id: "sin-fecha", date: "" })], "en");
  assert.equal(d["@type"], "EventSeries");
  assert.equal(d.subEvent.length, 1);
  assert.ok(d.subEvent[0].url.endsWith("/en/eventos/lazada-de-ano-nuevo"));
  assert.equal(d.description, undefined);
});
