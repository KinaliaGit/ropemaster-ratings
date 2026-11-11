import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase } from "@/lib/supabase/server";
import type { EventItem } from "@/lib/types";
import { EVENT_PHOTOS_BUCKET, publicStorageUrl } from "@/lib/storage";
import { getEnrollmentCounts, getEventEnrolled } from "@/lib/data/registrations";

// Columnas que se piden (siempre por nombre) y su forma. El evento se identifica en las URLs por su `slug`.
const COLUMNS = "id, slug, name, event_date, city, venue, description, disciplines, capacity, status, organizer_id, organizer_name, cover_url, updated_at, results_closed_at, event_categories(id, name, fee_cents), event_photos(id, storage_path, position)";

type Row = {
  id: string; slug: string | null; name: string; event_date: string | null; city: string | null; venue: string | null; description: string | null;
  disciplines: string[] | null; capacity: number | null; status: string; organizer_id: string | null; organizer_name: string | null;
  cover_url: string | null; updated_at: string; results_closed_at: string | null; event_categories: { id: string; name: string; fee_cents: number }[] | null;
  event_photos: { id: string; storage_path: string; position: number }[] | null;
};

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

function toItem(r: Row, enrolled: number): EventItem {
  const id = r.slug ?? r.id;
  return {
    id, uuid: r.id, organizerId: r.organizer_id ?? undefined, name: r.name, date: r.event_date ?? "", city: r.city ?? "", venue: r.venue ?? "",
    disciplines: r.disciplines ?? [], capacity: r.capacity ?? 0, description: r.description ?? "", organizer: r.organizer_name ?? "",
    categories: (r.event_categories ?? []).map((c) => ({ id: c.id, name: c.name, fee: Math.round(c.fee_cents / 100) })),
    status: r.status as EventItem["status"], cover: r.cover_url ?? undefined, updatedAt: r.updated_at, resultsClosed: r.results_closed_at !== null,
    tone: hash(id) % 3,
    photos: (r.event_photos ?? []).sort((a, b) => a.position - b.position).map((p) => ({ id: p.id, url: publicStorageUrl(EVENT_PHOTOS_BUCKET, p.storage_path) })),
    enrolled,
  };
}

// ---- Públicas (en caché; se invalidan con updateTag("events") al crear o cambiar un evento) ----

export async function listPublicEvents(): Promise<EventItem[]> {
  "use cache";
  cacheTag("events", "registrations");
  cacheLife("minutes");
  const [{ data, error }, counts] = await Promise.all([
    createPublicClient().from("events").select(COLUMNS).in("status", ["publicado", "finalizado"]).order("event_date", { ascending: true }),
    getEnrollmentCounts(),
  ]);
  if (error) throw new Error(`No se pudieron leer los eventos: ${error.message}`);
  return (data as unknown as Row[]).map((r) => toItem(r, counts[r.id] ?? 0));
}

export async function getPublicEvent(slug: string): Promise<EventItem | null> {
  "use cache";
  cacheTag("events", "registrations");
  cacheLife("minutes");
  // Solo se cuentan los inscritos de ESTE evento (antes se calculaban los de todos), en paralelo con la lectura del evento.
  const [{ data, error }, enrolled] = await Promise.all([
    createPublicClient().from("events").select(COLUMNS).eq("slug", slug).in("status", ["publicado", "finalizado"]).maybeSingle(),
    getEventEnrolled(slug),
  ]);
  if (error) throw new Error(`No se pudo leer el evento: ${error.message}`);
  return data ? toItem(data as unknown as Row, enrolled) : null;
}

// ---- Del organizador (con su sesión; sin caché: ve también sus borradores) ----

export async function listOrganizerEvents(organizerId: string): Promise<EventItem[]> {
  const supabase = await createServerSupabase();
  const [{ data, error }, regs] = await Promise.all([
    supabase.from("events").select(COLUMNS).eq("organizer_id", organizerId).order("event_date", { ascending: false }),
    supabase.from("registrations").select("event_id"), // las reglas solo devuelven las de sus eventos
  ]);
  if (error) throw new Error(`No se pudieron leer tus eventos: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const r of regs.data ?? []) counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
  return (data as unknown as Row[]).map((r) => toItem(r, counts[r.id] ?? 0));
}

export async function getOrganizerEvent(organizerId: string, slug: string): Promise<EventItem | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("events").select(COLUMNS).eq("organizer_id", organizerId).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`No se pudo leer el evento: ${error.message}`);
  if (!data) return null;
  const { count } = await supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", (data as unknown as Row).id);
  return toItem(data as unknown as Row, count ?? 0);
}
