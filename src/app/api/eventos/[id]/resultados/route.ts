import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { getDictionary, hasLocale } from "@/lib/i18n";
import { getPublicEvent } from "@/lib/data/events";
import { getEventResults } from "@/lib/data/event-results";
import { parseEventResultsQuery } from "@/lib/event-results";
import { toResultItem } from "@/lib/event-results-view";

// Siguiente página de los resultados de un evento publicado o finalizado (KIN-608). Información pública, sin cuenta ni código.
//   GET /api/eventos/<slug>/resultados?discipline=lazo&lang=es&after=30
//   -> { rows: [...], next: número | null, total: número }   (`next` es el `after` de la página siguiente; null si ya no hay más)
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[id]/resultados">) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "es";
  if (!hasLocale(lang)) return Response.json({ error: "Idioma no válido" }, { status: 400 });
  const parsed = parseEventResultsQuery(url, ACTIVE_DISCIPLINES.map((d) => d.id));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const event = await getPublicEvent(id);
    if (!event?.uuid) return Response.json({ error: "Evento no encontrado" }, { status: 404 });
    const page = await getEventResults(event.uuid, parsed.value.discipline, parsed.value.after);
    const t = getDictionary(lang);
    return Response.json({ rows: page.rows.map((r) => toResultItem(r, lang, t)), next: page.next, total: page.total }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return Response.json({ error: "No se pudieron leer los resultados" }, { status: 503 });
  }
}
