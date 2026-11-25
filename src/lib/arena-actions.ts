"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { arenaKey, cleanArenaName } from "@/lib/arena";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function organizer(l: string) {
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  if (!session.verified) redirect(`/${l}/organizador`); // sin licencia vigente ni aprobación no se crean arenas (la base también lo impone)
  return session;
}

// Datos de una arena desde un formulario. null si el nombre no sirve (vacío o solo signos).
function parseArena(formData: FormData) {
  const name = cleanArenaName(text(formData.get("name"), 120));
  if (!arenaKey(name)) return null;
  return { name, city: text(formData.get("city"), 80), notes: text(formData.get("notes"), 500) };
}

const isDuplicate = (error: { code?: string; message: string }) => error.code === "23505" || error.message.includes("arenas_organizer_id_key_key");

// Agrega una arena al catálogo del organizador. Dos nombres que solo difieren en mayúsculas, acentos o signos son la misma arena.
export async function createArena(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await organizer(l);
  const a = parseArena(formData);
  if (!a) redirect(`/${l}/organizador/arenas?error=invalid`);
  const { error } = await (await createServerSupabase()).from("arenas").insert({ organizer_id: session.id, ...a });
  if (error) redirect(`/${l}/organizador/arenas?error=${isDuplicate(error) ? "duplicate" : "failed"}`);
  redirect(`/${l}/organizador/arenas?agregada=1`);
}

// Cambia nombre, ciudad y notas. La base actualiza los eventos de la arena que no han finalizado y las plantillas de sus series.
export async function updateArena(formData: FormData) {
  const l = lang(formData.get("lang"));
  const id = text(formData.get("id"), 36);
  await organizer(l);
  if (!UUID.test(id)) redirect(`/${l}/organizador/arenas`);
  const a = parseArena(formData);
  if (!a) redirect(`/${l}/organizador/arenas/${id}?error=invalid`);
  const { data, error } = await (await createServerSupabase()).from("arenas").update(a).eq("id", id).select("id");
  if (error) redirect(`/${l}/organizador/arenas/${id}?error=${isDuplicate(error) ? "duplicate" : "failed"}`);
  if (!data?.length) redirect(`/${l}/organizador/arenas`);
  updateTag("events");
  redirect(`/${l}/organizador/arenas/${id}?guardada=1`);
}

// Borra una arena que ningún evento ni serie usa (la base lo impone: si está en uso no borra nada).
export async function deleteArena(formData: FormData) {
  const l = lang(formData.get("lang"));
  const id = text(formData.get("id"), 36);
  await organizer(l);
  if (!UUID.test(id)) redirect(`/${l}/organizador/arenas`);
  const { data, error } = await (await createServerSupabase()).from("arenas").delete().eq("id", id).select("id");
  if (error || !data?.length) redirect(`/${l}/organizador/arenas/${id}?error=inUse`);
  redirect(`/${l}/organizador/arenas?borrada=1`);
}

// Une dos arenas: todo lo de `drop` pasa a `keep` y `drop` se borra. No se pierde ningún evento ni serie.
export async function mergeArenas(formData: FormData) {
  const l = lang(formData.get("lang"));
  const drop = text(formData.get("drop"), 36);
  const keep = text(formData.get("keep"), 36);
  await organizer(l);
  if (!UUID.test(drop) || !UUID.test(keep)) redirect(`/${l}/organizador/arenas`);
  const { error } = await (await createServerSupabase()).rpc("merge_arenas", { p_keep: keep, p_drop: drop });
  if (error) redirect(`/${l}/organizador/arenas/${drop}?error=mergeFailed`);
  updateTag("events");
  redirect(`/${l}/organizador/arenas/${keep}?unida=1`);
}
