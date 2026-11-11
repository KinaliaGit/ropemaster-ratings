import { DEFAULT_DISCIPLINE } from "@/lib/disciplines";
import { getDictionary, hasLocale } from "@/lib/i18n";
import { getPublicEvent } from "@/lib/data/events";
import { getEventRegistrants } from "@/lib/data/registrations";
import { decodeEnrolledCursor } from "@/lib/enrolled";
import { toEnrolledItem } from "@/lib/enrolled-view";

// Siguiente página de los inscritos de un evento publicado o finalizado (KIN-612). Información pública, sin cuenta ni código.
//   GET /api/eventos/<slug>/inscritos?lang=es&cursor=<texto>
//   -> { rows: [...], next: texto | null }   (`next` es el `cursor` de la página siguiente; null si ya no hay más)
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[id]/inscritos">) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "es";
  if (!hasLocale(lang)) return Response.json({ error: "Idioma no válido" }, { status: 400 });
  const cursor = url.searchParams.get("cursor") || null;
  if (!decodeEnrolledCursor(cursor).ok) return Response.json({ error: "El cursor no es válido." }, { status: 400 });

  try {
    const event = await getPublicEvent(id);
    if (!event?.uuid) return Response.json({ error: "Evento no encontrado" }, { status: 404 });
    const page = await getEventRegistrants(event.uuid, event.disciplines[0] ?? DEFAULT_DISCIPLINE, cursor);
    const t = getDictionary(lang);
    return Response.json({ rows: page.rows.map((r) => toEnrolledItem(r, lang, t)), next: page.next }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return Response.json({ error: "No se pudo leer la lista de inscritos" }, { status: 503 });
  }
}
