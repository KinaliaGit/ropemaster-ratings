"use server";
import { getSession } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { checkActiveOrganizer } from "@/lib/app-organizer";
import { cleanLabel, normalizeScopes } from "@/lib/app-connection";
import { createEventInvite, revokeEventConnection } from "@/lib/event-connections";

// Enlaces privados por evento desde el panel del organizador (KIN-783). La invitación en claro se devuelve UNA vez; en la base queda su hash.
export type CreateLinkResult =
  | { ok: true; invite: string }
  | { ok: false; error: "unauthorized" | "not_active" | "invalid_event" | "invalid_scopes" | "not_found" | "not_published" | "limit" | "writer_exists" | "failed" };

export async function createEventLinkAction(eventId: string, label: string, scopes: string[]): Promise<CreateLinkResult> {
  const s = await getSession();
  if (s?.role !== "organizador") return { ok: false, error: "unauthorized" };
  const normalized = normalizeScopes(scopes);
  if (!normalized) return { ok: false, error: "invalid_scopes" };
  try {
    const db = adminClient();
    if (!db) return { ok: false, error: "failed" };
    const active = await checkActiveOrganizer(db, s.id);
    if (!active.ok) return { ok: false, error: active.status === 403 ? "not_active" : "failed" };
    const created = await createEventInvite(s.id, eventId, cleanLabel(label), normalized);
    return "failure" in created ? { ok: false, error: created.failure } : { ok: true, invite: created.invite };
  } catch {
    return { ok: false, error: "failed" };
  }
}

// Revoca un enlace: quien lo tenga pierde el acceso al instante (y, si era el escritor, otro puede ocupar su lugar).
export async function revokeEventLinkAction(id: string): Promise<{ ok?: true; error?: string }> {
  const s = await getSession();
  if (s?.role !== "organizador") return { error: "unauthorized" };
  try {
    return (await revokeEventConnection(s.id, id)) ? { ok: true } : { error: "not_found" };
  } catch {
    return { error: "failed" };
  }
}
