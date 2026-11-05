"use server";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

export type CreateParticipantState =
  | null
  | { ok: true; name: string }
  | { ok: false; error: "unauthorized" | "invalid_name" | "invalid_phone" | "consent" | "failed" }
  | { ok: false; error: "duplicate"; matches: string[] };

// Alta de un participante por un organizador VERIFICADO (o admin). El celular se normaliza a formato internacional (E.164)
// y se guarda junto con el participante en una sola operación (si algo falla, no queda nada a medias).
export async function createParticipant(_prev: CreateParticipantState, formData: FormData): Promise<CreateParticipantState> {
  const s = await getSession();
  if (!s || s.role !== "organizador" || s.demo || (!s.verified && !s.isAdmin)) return { ok: false, error: "unauthorized" };

  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "invalid_name" };
  const phone = parsePhoneNumberFromString(String(formData.get("phone") ?? ""), "MX"); // sin lada internacional se asume México
  if (!phone?.isValid()) return { ok: false, error: "invalid_phone" };
  if (formData.get("consent") !== "on") return { ok: false, error: "consent" };

  const supabase = await createServerSupabase();
  // Un mismo celular puede tener varios perfiles (padre e hijo): avisa de los existentes y deja confirmar.
  if (formData.get("force") !== "on") {
    const { data } = await supabase.from("roper_contacts").select("ropers!inner(full_name)").eq("phone_e164", phone.number);
    const matches = (data ?? []).map((r) => (r.ropers as unknown as { full_name: string }).full_name);
    if (matches.length) return { ok: false, error: "duplicate", matches };
  }
  const { error } = await supabase.rpc("create_participant", { p_name: name, p_phone: phone.number });
  if (error) return { ok: false, error: "failed" };
  updateTag("ropers");
  return { ok: true, name };
}
