"use server";
import { getSession } from "@/lib/session";
import { createSyncToken } from "@/lib/sync-tokens";

// Devuelve el código en claro UNA sola vez; después solo queda su hash.
export async function generateSyncToken(): Promise<{ token?: string; error?: string }> {
  const s = await getSession();
  if (s?.role !== "organizador") return { error: "unauthorized" };
  return { token: createSyncToken(s.id) };
}
