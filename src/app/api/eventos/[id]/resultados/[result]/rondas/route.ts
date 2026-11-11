import { getDictionary, hasLocale } from "@/lib/i18n";
import { getPublicEvent } from "@/lib/data/events";
import { getEventResultRounds } from "@/lib/data/event-results";
import { isUuid } from "@/lib/event-results";
import { toRoundItem } from "@/lib/results-view";

// Rondas de UN resultado de un evento (KIN-608), solo cuando se abre en la página del evento: la lista no las trae.
//   GET /api/eventos/<slug>/resultados/<resultado>/rondas?lang=es  ->  { rounds: [...] }
// Un resultado que no existe, es de otro evento o es de un evento que no es público responde 404.
export async function GET(request: Request, ctx: RouteContext<"/api/eventos/[id]/resultados/[result]/rondas">) {
  const { id, result } = await ctx.params;
  if (!isUuid(result)) return Response.json({ error: "El id no es válido." }, { status: 400 });
  const lang = new URL(request.url).searchParams.get("lang") ?? "es";
  if (!hasLocale(lang)) return Response.json({ error: "Idioma no válido" }, { status: 400 });

  try {
    const event = await getPublicEvent(id);
    if (!event?.uuid) return Response.json({ error: "Evento no encontrado" }, { status: 404 });
    const rounds = await getEventResultRounds(event.uuid, result.toLowerCase());
    if (!rounds) return Response.json({ error: "Resultado no encontrado" }, { status: 404 });
    const t = getDictionary(lang);
    return Response.json({ rounds: rounds.map((r, i) => toRoundItem(r, i, t)) }, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return Response.json({ error: "No se pudieron leer las rondas" }, { status: 503 });
  }
}
