"use server";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkImage } from "@/lib/image-validate";
import { MAX_AVATAR_BYTES } from "@/lib/limits";
import { AVATARS_BUCKET, publicStorageUrl, type PhotoResult } from "@/lib/storage";

// Foto de perfil. Solo el participante dueño (la base y Storage además lo imponen) y solo imágenes reales.
// Cada foto tiene nombre único (<roper_id>/<marca de tiempo>.jpg): la URL cambia al reemplazarla y la caché nunca muestra la vieja.
async function myRoper() {
  const s = await getSession();
  if (!s || !s.hasRoper) return { error: "unauthorized" as const };
  const supabase = await createServerSupabase();
  const { data: roperId } = await supabase.rpc("my_roper_id");
  if (!roperId) return { error: "unauthorized" as const };
  const { data } = await supabase.from("ropers").select("avatar_path").eq("id", roperId).maybeSingle();
  return { supabase, roperId: roperId as string, current: data?.avatar_path ?? null };
}

export async function setAvatar(formData: FormData): Promise<PhotoResult> {
  const me = await myRoper();
  if (me.error) return { ok: false, error: me.error };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "invalid" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImage(bytes, MAX_AVATAR_BYTES);
  if (!check.ok) return { ok: false, error: check.reason === "too_big" ? "too_big" : "invalid" };

  const path = `${me.roperId}/${Date.now()}.${check.ext}`;
  const up = await me.supabase.storage.from(AVATARS_BUCKET).upload(path, bytes, { contentType: check.mime, cacheControl: "31536000", upsert: false });
  if (up.error) return { ok: false, error: "failed" };

  const { error } = await me.supabase.from("ropers").update({ avatar_path: path }).eq("id", me.roperId);
  if (error) {
    await me.supabase.storage.from(AVATARS_BUCKET).remove([path]); // no dejar un archivo suelto
    return { ok: false, error: "failed" };
  }
  if (me.current) await me.supabase.storage.from(AVATARS_BUCKET).remove([me.current]); // limpia la foto anterior
  updateTag("ropers");
  return { ok: true, url: publicStorageUrl(AVATARS_BUCKET, path) };
}

export async function deleteAvatar(): Promise<PhotoResult> {
  const me = await myRoper();
  if (me.error) return { ok: false, error: me.error };
  const { error } = await me.supabase.from("ropers").update({ avatar_path: null }).eq("id", me.roperId);
  if (error) return { ok: false, error: "failed" };
  if (me.current) await me.supabase.storage.from(AVATARS_BUCKET).remove([me.current]);
  updateTag("ropers");
  return { ok: true };
}
