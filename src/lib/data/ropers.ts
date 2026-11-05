import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { ACTIVE_DISCIPLINES, type DisciplineId } from "@/lib/disciplines";
import type { Result, Roper, Stat } from "@/lib/types";
import { INITIAL_RATING } from "@/lib/rating";

// Lecturas PÚBLICAS de participantes. Las columnas siempre se piden por nombre: user_id y el celular están
// ocultos a propósito (el celular vive en roper_contacts, solo para organizadores verificados).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANKING = 500; // TODO: paginar cuando haya más participantes (el buscador filtra sobre lo cargado)

type RatingRow = { discipline: string; rating: number | string; events_count: number; wins: number; updated_at: string };

const initialStat = (): Stat => ({ rating: INITIAL_RATING, events: 0, wins: 0, initial: true });
const toStat = (r: RatingRow): Stat => ({ rating: Number(r.rating), events: r.events_count, wins: r.wins, updatedAt: r.updated_at });

// Ranking de una modalidad, de mayor a menor rating (y por nombre a igual rating). Entran TODOS los perfiles visibles: quien aún no
// tiene rating en esa modalidad aparece con el inicial (INITIAL_RATING).
export async function listRanking(discipline: DisciplineId): Promise<Roper[]> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  const sb = createPublicClient();
  const [people, ratings] = await Promise.all([
    sb.from("ropers").select("id, full_name, avatar_path").order("full_name", { ascending: true }).limit(MAX_RANKING),
    sb.from("roper_ratings").select("roper_id, discipline, rating, events_count, wins, updated_at").eq("discipline", discipline).limit(MAX_RANKING),
  ]);
  if (people.error) throw new Error(`No se pudo leer el ranking: ${people.error.message}`);
  if (ratings.error) throw new Error(`No se pudo leer el ranking: ${ratings.error.message}`);
  const byRoper = new Map((ratings.data ?? []).map((r) => [r.roper_id as string, r as RatingRow]));
  return (people.data ?? [])
    .map((p) => ({ id: p.id as string, name: p.full_name as string, avatarPath: p.avatar_path as string | null, stats: { [discipline]: byRoper.has(p.id) ? toStat(byRoper.get(p.id)!) : initialStat() } }))
    .sort((a, b) => b.stats[discipline]!.rating - a.stats[discipline]!.rating || a.name.localeCompare(b.name, "es"));
}

// Un participante con todos sus ratings. null si no existe o el id no es válido.
export async function getPublicRoper(id: string): Promise<Roper | null> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  if (!UUID.test(id)) return null;
  const sb = createPublicClient();
  const [person, ratings] = await Promise.all([
    sb.from("ropers").select("id, full_name, avatar_path").eq("id", id).maybeSingle(),
    sb.from("roper_ratings").select("discipline, rating, events_count, wins, updated_at").eq("roper_id", id),
  ]);
  if (person.error) throw new Error(`No se pudo leer el participante: ${person.error.message}`);
  if (!person.data) return null;
  const stats: Roper["stats"] = {};
  for (const r of (ratings.data ?? []) as RatingRow[]) {
    if (ACTIVE_DISCIPLINES.some((d) => d.id === r.discipline)) stats[r.discipline as DisciplineId] = toStat(r);
  }
  for (const d of ACTIVE_DISCIPLINES) stats[d.id] ??= initialStat(); // sin rating aún: parte del inicial
  return { id: person.data.id, name: person.data.full_name, avatarPath: person.data.avatar_path, stats };
}

type ResultRow = {
  id: string; discipline: string; time_ms: number | null; penalty_ms: number | null; disqualified: boolean; created_at: string;
  place?: number | null; events: { name: string; slug: string | null; event_date: string | null; verified: boolean } | null;
};

// Historial: solo de eventos públicos (publicados o finalizados). `place` llega cuando la base lo guarde (KIN-587).
export async function getRoperResults(id: string): Promise<Result[]> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  if (!UUID.test(id)) return [];
  const { data, error } = await createPublicClient()
    .from("event_results")
    .select("id, discipline, time_ms, penalty_ms, disqualified, created_at, events!inner(name, slug, event_date, verified)")
    .eq("roper_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`No se pudo leer el historial: ${error.message}`);
  return (data as unknown as ResultRow[]).filter((r) => r.events).map((r) => ({
    id: r.id, event: r.events!.name, eventSlug: r.events!.slug, date: r.events!.event_date ?? r.created_at.slice(0, 10), discipline: r.discipline,
    timeMs: r.time_ms, penaltyMs: r.penalty_ms ?? 0, disqualified: r.disqualified, place: r.place ?? null, eventVerified: r.events!.verified,
  }));
}

// Varios participantes por id (por ejemplo, los inscritos de un evento).
export async function getRopersByIds(ids: string[]): Promise<Roper[]> {
  "use cache";
  cacheTag("ropers");
  cacheLife("minutes");
  const valid = ids.filter((i) => UUID.test(i));
  if (valid.length === 0) return [];
  const { data, error } = await createPublicClient().from("ropers").select("id, full_name, avatar_path").in("id", valid);
  if (error) throw new Error(`No se pudieron leer los participantes: ${error.message}`);
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name, avatarPath: p.avatar_path, stats: {} }));
}
