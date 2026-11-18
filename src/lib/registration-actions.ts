"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getPublicEvent } from "@/lib/data/events";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const KNOWN = ["removed", "registration_closed", "full", "closed", "already", "invalid_category", "paid", "not_found"];
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
  if (!s.hasRoper) redirect(`/${l}/mi-cuenta?perfil=1`); // aún no tiene perfil de lazador: lo crea en Mi cuenta
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

// El organizador inscribe a un participante por su correo en un evento propio, también después del cierre de inscripciones (KIN-626).
// La base valida que el evento sea suyo y respeta cupo y categoría; la inscripción nace pendiente de pago.
export async function enrollByOrganizer(formData: FormData) {
  const l = lang(formData.get("lang"));
  const slug = String(formData.get("event") ?? "");
  const category = String(formData.get("category") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const back = (q: string) => redirect(`/${l}/organizador/eventos/${encodeURIComponent(slug)}?${q}`);
  const s = await getSession();
  if (s?.role !== "organizador" || !s.verified) redirect(`/${l}/organizador`);
  if (!UUID.test(category) || email.length < 3 || email.length > 200) return back("manual=invalid");
  const supabase = await createServerSupabase();
  const { data: ev } = await supabase.from("events").select("id").eq("slug", slug).eq("organizer_id", s.id).maybeSingle();
  if (!ev) redirect(`/${l}/organizador`);
  const { error } = await supabase.rpc("organizer_enroll", { p_event: ev.id, p_email: email, p_category: category });
  if (error) return back(`manual=${["not_found", "already", "full", "invalid_category"].find((k) => error.message.includes(k)) ?? "failed"}`);
  updateTag("registrations");
  return back("manual=ok");
}

// ---- Sacar a un inscrito del evento (KIN-621). La base valida que sea el organizador activo del evento (o un admin), el motivo y que el evento
// no esté finalizado ni la persona tenga resultados; aquí solo se manda y se vuelve a la página del evento con el resultado.
const REMOVE_ERRORS = ["invalid_reason", "has_results", "closed", "not_found", "no_payment"];
const removeCode = (message: string) => REMOVE_ERRORS.find((k) => message.includes(k)) ?? "failed";

async function organizerContext(formData: FormData) {
  const l = lang(formData.get("lang"));
  const slug = String(formData.get("slug") ?? "");
  const s = await getSession();
  const back = (q: string) => redirect(`/${l}/organizador/eventos/${encodeURIComponent(slug)}?${q}`);
  if ((s?.role !== "organizador" || !s.verified) && !s?.isAdmin) redirect(`/${l}/organizador`);
  return { back, supabase: await createServerSupabase() };
}

export async function removeRegistration(formData: FormData) {
  const { back, supabase } = await organizerContext(formData);
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!UUID.test(id)) return back("sacado=not_found");
  if (reason.length < 3 || reason.length > 500) return back("sacado=invalid_reason");
  const { error } = await supabase.rpc("remove_registration", { p_registration: id, p_reason: reason });
  if (error) return back(`sacado=${removeCode(error.message)}`);
  updateTag("registrations");
  return back("sacado=ok");
}

// Permitir (o volver a bloquear) que la persona sacada se inscriba sola otra vez.
export async function setRemovalReenroll(formData: FormData) {
  const { back, supabase } = await organizerContext(formData);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return back("sacado=not_found");
  const { error } = await supabase.rpc("set_removal_reenroll", { p_removal: id, p_allow: formData.get("allow") === "true" });
  return back(error ? `sacado=${removeCode(error.message)}` : "sacado=reenroll");
}

// Marcar que ya se devolvió el dinero a mano (o deshacerlo).
export async function setRemovalRefunded(formData: FormData) {
  const { back, supabase } = await organizerContext(formData);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return back("sacado=not_found");
  const { error } = await supabase.rpc("set_removal_refunded", { p_removal: id, p_done: formData.get("done") === "true" });
  return back(error ? `sacado=${removeCode(error.message)}` : "sacado=refund");
}
