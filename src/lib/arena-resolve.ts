import type { createServerSupabase } from "@/lib/supabase/server";
import { arenaKey, cleanArenaName } from "@/lib/arena";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type ResolvedArena = { id: string; name: string; city: string };

// La arena de un formulario de evento o de serie (KIN-751): o viene elegida del catálogo (`arenaId`, que debe ser del organizador) o se escribió
// una nueva (`venue` y `city`): si ya existe una con la misma llave se reutiliza y, si no, se crea. Devuelve null si no se pudo resolver.
// La base vuelve a comprobar que la arena sea del organizador (trigger) y deja el evento con su nombre y ciudad.
export async function resolveArena(supabase: Supabase, organizerId: string, formData: FormData): Promise<ResolvedArena | null> {
  const picked = text(formData.get("arenaId"), 36);
  if (picked) {
    if (!UUID.test(picked)) return null;
    const { data } = await supabase.from("arenas").select("id, name, city").eq("id", picked).eq("organizer_id", organizerId).maybeSingle();
    return data ?? null;
  }
  const name = cleanArenaName(text(formData.get("venue"), 120));
  const key = arenaKey(name);
  if (!key) return null;
  const { data: found } = await supabase.from("arenas").select("id, name, city").eq("organizer_id", organizerId).eq("key", key).maybeSingle();
  if (found) return found;
  const { data: created, error } = await supabase.from("arenas").insert({ organizer_id: organizerId, name, city: text(formData.get("city"), 80) }).select("id, name, city").single();
  return error ? null : created;
}
