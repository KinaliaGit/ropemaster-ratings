import { ACTIVE_DISCIPLINES, type DisciplineId } from "@/lib/disciplines";
import { listDirectoryPage } from "@/lib/data/ropers";
import { parseDirectoryQuery } from "@/lib/roper-directory";

// Directorio público de lazadores por nombre, con búsqueda y filtros (KIN-768). Sin cuenta: es información pública.
//   GET /api/directorio?discipline=lazo&q=ana&role=header&after=60
//   -> { rows: [...], next: número | null }   (`next` es el `after` de la página siguiente)
export async function GET(request: Request) {
  const parsed = parseDirectoryQuery(new URL(request.url), ACTIVE_DISCIPLINES.map((d) => d.id));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const page = await listDirectoryPage({ ...parsed.value, discipline: parsed.value.discipline as DisciplineId });
    return Response.json(page, { headers: { "Cache-Control": "public, max-age=30" } });
  } catch {
    return Response.json({ error: "No se pudo leer el directorio" }, { status: 503 });
  }
}
