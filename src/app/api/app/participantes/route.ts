import { ropers } from "@/lib/mock";
import { organizerFromRequest } from "@/lib/app-auth";

// La app local descarga el directorio global de participantes con su rating.
// Incluye el celular (es la llave de coincidencia) porque solo lo reciben organizadores autenticados.
export async function GET(request: Request) {
  const auth = organizerFromRequest(request);
  if (auth instanceof Response) return auth;
  return Response.json({
    participants: ropers.map((r) => ({
      global_id: r.id, name: r.name, phone: r.phone, rating: r.rating,
      events: r.events, wins: r.wins, phone_verified: r.verified,
    })),
  });
}
