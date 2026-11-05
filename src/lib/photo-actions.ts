"use server";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkImage } from "@/lib/image-validate";
import { MAX_EVENT_PHOTO_BYTES, MAX_EVENT_PHOTOS } from "@/lib/limits";
import { EVENT_PHOTOS_BUCKET, publicStorageUrl, type PhotoResult } from "@/lib/storage";

// Fotos de evento (portada y galería). Solo el organizador dueño del evento; la base y Storage además lo imponen.
async function myEvent(slug: unknown) {
  const s = await getSession();
  if (!s || s.role !== "organizador" || typeof slug !== "string") return { error: "unauthorized" as const };
  const supabase = await createServerSupabase();
  const { data: event } = await supabase.from("events").select("id, cover_url, event_photos(id, storage_path, position)").eq("slug", slug).eq("organizer_id", s.id).maybeSingle();
  if (!event) return { error: "unauthorized" as const };
  return { supabase, event };
}

export async function addEventPhoto(formData: FormData): Promise<PhotoResult> {
  const ctx = await myEvent(formData.get("event"));
  if (ctx.error) return { ok: false, error: ctx.error };
  const { supabase, event } = ctx;
  if (event.event_photos.length >= MAX_EVENT_PHOTOS) return { ok: false, error: "limit" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "invalid" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(bytes, MAX_EVENT_PHOTO_BYTES);
  if (!check.ok) return { ok: false, error: check.reason === "too_big" ? "too_big" : "invalid" };

  const path = `${event.id}/${crypto.randomUUID()}.${check.ext}`;
  const up = await supabase.storage.from(EVENT_PHOTOS_BUCKET).upload(path, bytes, { contentType: check.mime, cacheControl: "31536000", upsert: false });
  if (up.error) return { ok: false, error: "failed" };

  const position = event.event_photos.reduce((m, p) => Math.max(m, p.position), -1) + 1;
  const { data: row, error } = await supabase.from("event_photos").insert({ event_id: event.id, storage_path: path, position }).select("id").single();
  if (error || !row) {
    await supabase.storage.from(EVENT_PHOTOS_BUCKET).remove([path]);
    return { ok: false, error: "failed" };
  }
  const url = publicStorageUrl(EVENT_PHOTOS_BUCKET, path);
  if (!event.cover_url) await supabase.from("events").update({ cover_url: url }).eq("id", event.id); // la primera foto es la portada
  updateTag("events");
  return { ok: true, id: row.id, url };
}

export async function setEventCover(slug: string, photoId: string): Promise<PhotoResult> {
  const ctx = await myEvent(slug);
  if (ctx.error) return { ok: false, error: ctx.error };
  const photo = ctx.event.event_photos.find((p) => p.id === photoId);
  if (!photo) return { ok: false, error: "invalid" };
  const url = publicStorageUrl(EVENT_PHOTOS_BUCKET, photo.storage_path);
  const { error } = await ctx.supabase.from("events").update({ cover_url: url }).eq("id", ctx.event.id);
  if (error) return { ok: false, error: "failed" };
  updateTag("events");
  return { ok: true, url };
}

export async function deleteEventPhoto(slug: string, photoId: string): Promise<PhotoResult> {
  const ctx = await myEvent(slug);
  if (ctx.error) return { ok: false, error: ctx.error };
  const { supabase, event } = ctx;
  const photo = event.event_photos.find((p) => p.id === photoId);
  if (!photo) return { ok: false, error: "invalid" };

  const { error } = await supabase.from("event_photos").delete().eq("id", photoId);
  if (error) return { ok: false, error: "failed" };
  await supabase.storage.from(EVENT_PHOTOS_BUCKET).remove([photo.storage_path]); // sin archivos huérfanos

  // Si era la portada, la siguiente foto toma su lugar (o queda sin portada).
  if (event.cover_url === publicStorageUrl(EVENT_PHOTOS_BUCKET, photo.storage_path)) {
    const next = event.event_photos.filter((p) => p.id !== photoId).sort((a, b) => a.position - b.position)[0];
    await supabase.from("events").update({ cover_url: next ? publicStorageUrl(EVENT_PHOTOS_BUCKET, next.storage_path) : null }).eq("id", event.id);
  }
  updateTag("events");
  return { ok: true };
}
