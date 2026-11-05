"use server";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

export type CreateParticipantState =
  | null
  | { ok: true; name: string }
  | { ok: false; error: "unauthorized" | "invalid_name" | "invalid_email" | "consent" | "failed" }
  | { ok: false; error: "duplicate"; name: string | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Alta de un participante por un organizador VERIFICADO (o admin), con su nombre y su correo. Se guarda en una sola operación
// (si algo falla, no queda nada a medias). El correo es único: si ya existe, se avisa de quién es. Cuando la persona cree su cuenta
// con ese mismo correo (confirmado), reclama este perfil y conserva su historial.
export async function createParticipant(_prev: CreateParticipantState, formData: FormData): Promise<CreateParticipantState> {
  const s = await getSession();
  if (!s || s.role !== "organizador" || (!s.verified && !s.isAdmin)) return { ok: false, error: "unauthorized" };

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "invalid_name" };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email.length > 200 || !EMAIL.test(email)) return { ok: false, error: "invalid_email" };
  if (formData.get("consent") !== "on") return { ok: false, error: "consent" };

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_participant", { p_name: name, p_email: email });
  if (error?.code === "23505") {
    const { data } = await supabase.from("roper_contacts").select("ropers!inner(full_name)").eq("email", email).maybeSingle();
    return { ok: false, error: "duplicate", name: (data?.ropers as unknown as { full_name: string } | null)?.full_name ?? null };
  }
  if (error) return { ok: false, error: "failed" };
  updateTag("ropers");
  return { ok: true, name };
}
