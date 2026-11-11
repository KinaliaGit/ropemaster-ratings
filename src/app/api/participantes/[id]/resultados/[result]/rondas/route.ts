import { getDictionary, hasLocale } from "@/lib/i18n";
import { getRoperRounds } from "@/lib/data/ropers";
import { isUuid } from "@/lib/results-history";
import { toRoundItem } from "@/lib/results-view";

// Rondas de UN resultado del lazador (KIN-609), solo cuando se abre en el perfil: la lista del historial no las trae.
//   GET /api/participantes/<id>/resultados/<resultado>/rondas?lang=es  ->  { rounds: [...] }
// Un resultado que no existe, no es de ese lazador o es de un evento que no es público responde 404.
export async function GET(request: Request, ctx: RouteContext<"/api/participantes/[id]/resultados/[result]/rondas">) {
  const { id, result } = await ctx.params;
  if (!isUuid(id) || !isUuid(result)) return Response.json({ error: "El id no es válido." }, { status: 400 });
  const lang = new URL(request.url).searchParams.get("lang") ?? "es";
  if (!hasLocale(lang)) return Response.json({ error: "Idioma no válido" }, { status: 400 });

  try {
    const rounds = await getRoperRounds(id.toLowerCase(), result.toLowerCase());
    if (!rounds) return Response.json({ error: "Resultado no encontrado" }, { status: 404 });
    const t = getDictionary(lang);
    return Response.json({ rounds: rounds.map((r, i) => toRoundItem(r, i, t)) }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return Response.json({ error: "No se pudieron leer las rondas" }, { status: 503 });
  }
}
