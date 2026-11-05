import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServerSupabase } from "@/lib/supabase/server";
import type { EventItem } from "@/lib/types";

// Columnas que se piden (siempre por nombre) y su forma. El evento se identifica en las URLs por su `slug`.
const COLUMNS = "id, slug, name, event_date, city, venue, description, disciplines, capacity, status, organizer_id, organizer_name, cover_url, updated_at, event_categories(name, fee_cents)";

type Row = {
  id: string; slug: string | null; name: string; event_date: string | null; city: string | null; venue: string | null; description: string | null;
  disciplines: string[] | null; capacity: number | null; status: string; organizer_id: string | null; organizer_name: string | null;
  cover_url: string | null; updated_at: string; event_categories: { name: string; fee_cents: number }[] | null;
};

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

function toItem(r: Row): EventItem {
  const id = r.slug ?? r.id;
  return {
    id, uuid: r.id, organizerId: r.organizer_id ?? undefined, name: r.name, date: r.event_date ?? "", city: r.city ?? "", venue: r.venue ?? "",
    disciplines: r.disciplines ?? [], capacity: r.capacity ?? 0, description: r.description ?? "", organizer: r.organizer_name ?? "",
    categories: (r.event_categories ?? []).map((c) => ({ name: c.name, fee: Math.round(c.fee_cents / 100) })),
    status: r.status as EventItem["status"], cover: r.cover_url ?? undefined, updatedAt: r.updated_at,
    tone: hash(id) % 3,
    // TODO: inscritos y fotos reales (tablas registrations y event_photos) cuando se conecten los participantes.
    registered: [], photos: [],
  };
}

// ---- Públicas (en caché; se invalidan con updateTag("events") al crear o cambiar un evento) ----

export async function listPublicEvents(): Promise<EventItem[]> {
  "use cache";
  cacheTag("events");
  cacheLife("minutes");
  const { data, error } = await createPublicClient().from("events").select(COLUMNS).in("status", ["publicado", "finalizado"]).order("event_date", { ascending: true });
  if (error) throw new Error(`No se pudieron leer los eventos: ${error.message}`);
  return (data as unknown as Row[]).map(toItem);
}

export async function getPublicEvent(slug: string): Promise<EventItem | null> {
  "use cache";
  cacheTag("events");
  cacheLife("minutes");
  const { data, error } = await createPublicClient().from("events").select(COLUMNS).eq("slug", slug).in("status", ["publicado", "finalizado"]).maybeSingle();
  if (error) throw new Error(`No se pudo leer el evento: ${error.message}`);
  return data ? toItem(data as unknown as Row) : null;
}

// ---- Del organizador (con su sesión; sin caché: ve también sus borradores) ----

export async function listOrganizerEvents(organizerId: string): Promise<EventItem[]> {
  const { data, error } = await (await createServerSupabase()).from("events").select(COLUMNS).eq("organizer_id", organizerId).order("event_date", { ascending: false });
  if (error) throw new Error(`No se pudieron leer tus eventos: ${error.message}`);
  return (data as unknown as Row[]).map(toItem);
}

export async function getOrganizerEvent(organizerId: string, slug: string): Promise<EventItem | null> {
  const { data, error } = await (await createServerSupabase()).from("events").select(COLUMNS).eq("organizer_id", organizerId).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`No se pudo leer el evento: ${error.message}`);
  return data ? toItem(data as unknown as Row) : null;
}
