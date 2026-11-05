export const AVATARS_BUCKET = "avatars";
export const EVENT_PHOTOS_BUCKET = "event-photos";

// URL pública de un archivo de un bucket público de Supabase Storage.
export const publicStorageUrl = (bucket: string, path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

export type PhotoError = "demo" | "unauthorized" | "invalid" | "too_big" | "limit" | "failed";
export type PhotoResult = { ok: true; url?: string; id?: string } | { ok: false; error: PhotoError };
