import { getMyUnread } from "@/lib/data/notifications";

// Cuántos avisos sin leer tiene quien visita y de cuándo es el más reciente. La web lo consulta cada rato para avisar con sonido (KIN-657).
//   GET /api/avisos  ->  { count: número, latest: fecha | null }   (sin sesión, la base no devuelve nada)
export async function GET() {
  const unread = await getMyUnread();
  if (!unread) return Response.json({ error: "No se pudieron leer los avisos" }, { status: 503 });
  return Response.json(unread, { headers: { "Cache-Control": "private, no-store" } });
}
