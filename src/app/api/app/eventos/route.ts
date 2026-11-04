import { listPublicEvents } from "@/lib/data/events";
import { organizerFromRequest } from "@/lib/app-auth";

// La app local descarga los eventos publicados y finalizados del organizador.
// ?since=<ISO> devuelve solo los modificados después de esa fecha (sincronización incremental).
// Los borradores no se envían. Los eventos publicados son públicos, así que no hace falta una llave secreta.
// TODO: incluir inscritos (`registrations`) cuando existan los participantes reales y la llave de servicio.
export async function GET(request: Request) {
  const auth = organizerFromRequest(request);
  if (auth instanceof Response) return auth;
  const since = new URL(request.url).searchParams.get("since") ?? "";

  const list = (await listPublicEvents())
    .filter((e) => e.organizerId === auth.organizer && e.updatedAt > since)
    .map((e) => ({
      id: e.uuid, slug: e.id, name: e.name, date: e.date, city: e.city, venue: e.venue, status: e.status,
      disciplines: e.disciplines, capacity: e.capacity, description: e.description, updated_at: e.updatedAt,
      categories: e.categories.map((c) => ({ name: c.name, fee_cents: c.fee * 100 })),
      registrations: [],
    }));
  return Response.json({ organizer: auth.organizer, events: list });
}
