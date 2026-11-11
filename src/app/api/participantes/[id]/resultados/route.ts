import { getDictionary, hasLocale } from "@/lib/i18n";
import { getRoperHistory } from "@/lib/data/ropers";
import { decodeHistoryCursor, isUuid } from "@/lib/results-history";
import { toHistoryItem } from "@/lib/results-view";

// Siguiente página del historial de un lazador (KIN-609). Información pública, sin cuenta ni código.
//   GET /api/participantes/<id>/resultados?lang=es&cursor=2026-10-04~<uuid>
//   -> { rows: [...], next: texto | null }   (`next` es el `cursor` de la página siguiente; null si ya no hay más)
export async function GET(request: Request, ctx: RouteContext<"/api/participantes/[id]/resultados">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "El id no es válido." }, { status: 400 });
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "es";
  if (!hasLocale(lang)) return Response.json({ error: "Idioma no válido" }, { status: 400 });
  const cursor = decodeHistoryCursor(url.searchParams.get("cursor"));
  if (!cursor.ok) return Response.json({ error: "El cursor no es válido." }, { status: 400 });

  try {
    const page = await getRoperHistory(id, url.searchParams.get("cursor") || null);
    const t = getDictionary(lang);
    return Response.json({ rows: page.rows.map((r) => toHistoryItem(r, lang, t)), next: page.next }, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return Response.json({ error: "No se pudo leer el historial" }, { status: 503 });
  }
}
