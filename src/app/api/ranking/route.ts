import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { hasLocale, getDictionary } from "@/lib/i18n";
import { listRankingPage, searchRankingPage } from "@/lib/data/ropers";
import { parseRankingQuery } from "@/lib/ranking";
import { toParticipantRow } from "@/lib/ranking-view";

// Siguiente página del ranking público, o el resultado de una búsqueda por nombre (KIN-613). Sin cuenta ni código: es información pública.
//   GET /api/ranking?discipline=lazo&lang=es&q=ana&after=50
//   -> { rows: [...], next: número | null }   (`next` es el `after` de la página siguiente; null si ya no hay más)
// Sin búsqueda, las páginas salen de la caché del servidor; con búsqueda se consulta la base y el navegador la guarda 30 s.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseRankingQuery(url, ACTIVE_DISCIPLINES.map((d) => d.id));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const lang = url.searchParams.get("lang") ?? "es";
  if (!hasLocale(lang)) return Response.json({ error: "Idioma no válido" }, { status: 400 });

  const { discipline, tokens, after } = parsed.value;
  try {
    const page = tokens.length ? await searchRankingPage(discipline, tokens, after) : await listRankingPage(discipline, after);
    const t = getDictionary(lang);
    return Response.json(
      { rows: page.rows.map((r) => toParticipantRow(r, lang, t)), next: page.next },
      { headers: { "Cache-Control": "public, max-age=30" } },
    );
  } catch {
    return Response.json({ error: "No se pudo leer el ranking" }, { status: 503 });
  }
}
