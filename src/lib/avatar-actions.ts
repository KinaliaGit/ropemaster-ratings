"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { saveAvatar, removeAvatar } from "@/lib/avatars";

// Solo el participante dueño del perfil puede cambiar su foto (el id sale de su sesión, nunca del cliente).
export async function setAvatar(dataUrl: string): Promise<{ ok: boolean }> {
  const s = await getSession();
  if (s?.role !== "participante" || typeof dataUrl !== "string" || !saveAvatar(s.id, dataUrl)) return { ok: false };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteAvatar(): Promise<{ ok: boolean }> {
  const s = await getSession();
  if (s?.role !== "participante") return { ok: false };
  removeAvatar(s.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
