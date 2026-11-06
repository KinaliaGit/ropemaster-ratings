"use server";
import { getSession } from "@/lib/session";
import { createSyncToken, revokeDevice, revokeSyncToken } from "@/lib/sync-tokens";

// Devuelve el código en claro UNA sola vez; después solo queda su hash.
export async function generateSyncToken(): Promise<{ token?: string; error?: string }> {
  const s = await getSession();
  if (s?.role !== "organizador") return { error: "unauthorized" };
  try {
    return { token: await createSyncToken(s.id) };
  } catch {
    return { error: "failed" };
  }
}

// Revoca el código activo sin generar otro: la app conectada deja de funcionar al instante.
export async function revokeSyncTokenAction(): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (s?.role !== "organizador") return { error: "unauthorized" };
  try {
    await revokeSyncToken(s.id);
    return { ok: true };
  } catch {
    return { error: "failed" };
  }
}

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
