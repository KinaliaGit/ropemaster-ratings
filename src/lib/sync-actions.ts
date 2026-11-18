"use server";
import { getSession } from "@/lib/session";
import { revokeDevice } from "@/lib/sync-tokens";

// Revoca UN equipo conectado con correo y contraseña (desde el panel): ese equipo deja de sincronizar al instante.
export async function revokeDeviceAction(id: string): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (s?.role !== "organizador") return { error: "unauthorized" };
  try {
    return (await revokeDevice(s.id, id)) ? { ok: true } : { error: "not_found" };
  } catch {
    return { error: "failed" };
  }
}
