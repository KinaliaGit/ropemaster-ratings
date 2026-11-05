"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getPublicEvent } from "@/lib/data/events";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const KNOWN = ["full", "closed", "already", "invalid_category", "paid", "not_found"];
const codeOf = (message: string) => KNOWN.find((k) => message.includes(k)) ?? "failed";

// Inscribirse a un evento. La base valida todo (evento publicado, categoría del evento, no repetir, cupo con bloqueo) y el precio
// sale de la categoría, nunca del navegador. Queda en "pendiente" hasta que exista el pago.
export async function enroll(formData: FormData) {
  const l = lang(formData.get("lang"));
  const slug = String(formData.get("event") ?? "");
  const category = String(formData.get("category") ?? "");
  const back = (error: string) => redirect(`/${l}/eventos/${encodeURIComponent(slug)}/inscribirse?error=${error}`);
  const s = await getSession();
  if (!s) redirect(`/${l}/entrar?role=participante&next=${encodeURIComponent(`/${l}/eventos/${slug}/inscribirse`)}`);
  if (s.role !== "participante") return back("forbidden");
  const event = await getPublicEvent(slug);
  if (!event?.uuid || !UUID.test(category)) return back("invalid_category");
  const { error } = await (await createServerSupabase()).rpc("register_for_event", { p_event: event.uuid, p_category: category });
  if (error) return back(codeOf(error.message));
  updateTag("registrations");
  redirect(`/${l}/mi-cuenta?inscrito=1`);
}

// Cancelar una inscripción propia que aún no se ha pagado.
export async function cancelRegistration(formData: FormData) {
  const l = lang(formData.get("lang"));
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect(`/${l}/mi-cuenta`);
  const { error } = await (await createServerSupabase()).rpc("cancel_registration", { p_registration: id });
  if (!error) updateTag("registrations");
  redirect(`/${l}/mi-cuenta?${error ? `error=${codeOf(error.message)}` : "cancelado=1"}`);
}
