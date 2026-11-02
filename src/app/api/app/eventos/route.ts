import { events, ropers } from "@/lib/mock";
import { organizerFromRequest } from "@/lib/app-auth";

// La app local descarga los eventos del organizador (incluye inscritos).
// ?since=<ISO> devuelve solo los modificados después de esa fecha (sincronización incremental).
export async function GET(request: Request) {
  const auth = organizerFromRequest(request);
  if (auth instanceof Response) return auth;
  const since = new URL(request.url).searchParams.get("since") ?? "";

  const list = events
    .filter((e) => e.organizer === auth.organizer && e.status !== "borrador" && e.updatedAt > since)
    .map((e) => ({
      id: e.id, name: e.name, date: e.date, city: e.city, venue: e.venue, status: e.status,
      disciplines: e.disciplines, capacity: e.capacity, description: e.description, updated_at: e.updatedAt,
      categories: e.categories.map((c) => ({ name: c.name, fee_cents: c.fee * 100 })),
      registrations: e.registered.map((rid) => ({
        roper_global_id: rid, name: ropers.find((r) => r.id === rid)?.name,
        payment_status: e.unpaid?.includes(rid) ? "pendiente" : "pagado",
      })),
    }));
  return Response.json({ organizer: auth.organizer, events: list });
}
