import { organizerFromRequest } from "@/lib/app-auth";

// Directorio de participantes para la app local.
// Vacío por ahora: los participantes reales (con celular verificado) llegan con el login por celular.
// No se envían datos de ejemplo para que nunca se importen personas inventadas a la app de un organizador.
export async function GET(request: Request) {
  const auth = organizerFromRequest(request);
  if (auth instanceof Response) return auth;
  return Response.json({ participants: [] });
}
