import { ImageResponse } from "next/og";
import { createElement } from "react";
import { getSession } from "@/lib/session";
import { getOrganizerEvent } from "@/lib/data/events";
import { getDictionary, hasLocale } from "@/lib/i18n";
import { DEFAULT_DISCIPLINE } from "@/lib/disciplines";
import { buildPoster, checkPosterLogo, MAX_LOGO_BYTES, POSTER, type PosterEvent, type PosterLabels } from "@/lib/event-poster";
import { PosterImage } from "@/lib/event-poster-image";
import { posterBrandLogo, posterFonts } from "@/lib/event-poster-fonts";

// Póster del evento (KIN-767). Solo bajo demanda: el organizador lo pide, se arma al momento con los datos ACTUALES del evento y se devuelve como PNG 4:5.
// No se guarda nada: ni la imagen ni el logo. El logo opcional llega en esta misma petición (ya reducido por el navegador), se dibuja y se descarta.
//   POST /api/organizador/eventos/<slug>/poster   (multipart: lang = es | en, logo = archivo opcional)
//   -> 200 image/png | 400 invalid | 401 unauthorized | 404 not_found | 409 not_published | 500 failed
const json = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, ctx: RouteContext<"/api/organizador/eventos/[id]/poster">) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (session?.role !== "organizador") return json("unauthorized", 401);

  let form: FormData;
  try { form = await request.formData(); } catch { return json("invalid", 400); }
  const langRaw = form.get("lang");
  const lang = typeof langRaw === "string" && hasLocale(langRaw) ? langRaw : "es";

  // Un organizador solo genera el póster de sus propios eventos, y solo de uno ya publicado: un borrador no es público y su QR no abriría nada.
  const e = await getOrganizerEvent(session.id, id);
  if (!e) return json("not_found", 404);
  if (e.status !== "publicado") return json("not_published", 409);

  let logoDataUri: string | null = null;
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) return json("invalid_logo", 400);
    const bytes = new Uint8Array(await logo.arrayBuffer());
    const check = checkPosterLogo(bytes);
    if (!check.ok) return json("invalid_logo", 400);
    logoDataUri = `data:${check.mime};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  try {
    const t = getDictionary(lang);
    const p = t.org.poster.image;
    const labels: PosterLabels = {
      ...p, roundRobin: t.event.roundRobin, lazadaSorteada: t.event.lazadaSorteada, roundsWord: t.event.roundsWord, shortGoWord: t.org.form.shortGoWord,
    };
    const discipline = e.disciplines[0] ?? DEFAULT_DISCIPLINE;
    const input: PosterEvent = {
      name: e.name, date: e.date, time: e.time, venue: e.venue, city: e.city,
      disciplineLabel: t.disc[discipline as keyof typeof t.disc]?.label ?? discipline, drawType: e.drawType, shotsPerPackage: e.lazadaShotsPerPackage,
      rounds: e.rounds, shortGo: e.shortGo, categories: e.categories.map((c) => ({ name: c.name, fee: c.fee })),
      capacity: e.capacity, capacityHeaders: e.capacityHeaders, capacityHeelers: e.capacityHeelers, maxRoperRating: e.maxRoperRating, maxTeamRating: e.maxTeamRating,
      registrationClosesAt: e.registrationClosesAt, timezone: e.timezone, series: e.series?.name ?? null, description: e.description, organizer: e.organizer,
    };
    const model = buildPoster(input, lang, labels);

    // El QR lleva a la página pública del evento, sin idioma: cada persona que la abra llega a su idioma (el proxy elige por su navegador).
    const h = request.headers;
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const eventUrl = `${proto}://${host}/eventos/${e.id}`;

    const slug = e.id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "evento";
    return new ImageResponse(createElement(PosterImage, { model, eventUrl, logoDataUri, brandLogoDataUri: await posterBrandLogo(), labels: { organizer: p.organizer, signUp: p.signUp } }), {
      width: POSTER.width, height: POSTER.height, fonts: await posterFonts(),
      headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="poster-${slug}.png"`, "Cache-Control": "private, no-store" },
    });
  } catch {
    return json("failed", 500);
  }
}
