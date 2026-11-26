"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getPublicEvent } from "@/lib/data/events";
import { emailParticipant } from "@/lib/notify";
import { statusByDate } from "@/lib/event-time";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const KNOWN = ["invalid_packages", "not_open_yet", "role_required", "invalid_role", "removed", "registration_closed", "full", "not_full", "closed", "already", "invalid_category", "rating_limit", "paid", "not_found"];
const codeOf = (message: string) => KNOWN.find((k) => message.includes(k)) ?? "failed";

// Lo que mandan los formularios de inscribirse y de entrar a la lista de espera: mismas reglas de validación en la web y en la base.
async function enrollmentInput(formData: FormData) {
  const l = lang(formData.get("lang"));
  const slug = String(formData.get("event") ?? "");
  const category = String(formData.get("category") ?? "");
  const back = (error: string) => redirect(`/${l}/eventos/${encodeURIComponent(slug)}/inscribirse?error=${error}`);
  const s = await getSession();
  if (!s) redirect(`/${l}/entrar?role=participante&next=${encodeURIComponent(`/${l}/eventos/${slug}/inscribirse`)}`);
  if (!s.hasRoper) redirect(`/${l}/mi-cuenta?perfil=1`); // aún no tiene perfil de lazador: lo crea en Mi cuenta
  const event = await getPublicEvent(slug);
  if (!event?.uuid || !UUID.test(category)) return back("invalid_category");
  if (statusByDate(event) !== "publicado") return back("registration_closed"); // fecha pasada (KIN-656); la base lo vuelve a validar
  // Quien tiene el rol "Ambos" elige con cuál entra a este evento (cabecero, pialador o los dos): son dos inscripciones si elige los dos.
  // Para los demás perfiles el rol sale del perfil y no se manda nada (la base valida contra el perfil, no contra el navegador).
  // KIN-793: en Lazada Sorteada TODOS eligen su rol al inscribirse (viene marcado el de su perfil, pero puede cambiarlo): la inscripción lleva su
  // propio rol y no cambia el perfil. En los demás tipos de sorteo todo sigue igual.
  const picked = String(formData.get("role") ?? "");
  const lazada = event.drawType === "lazada_sorteada";
  const validPick = ["header", "heeler", "both"].includes(picked);
  const role = (lazada || s.roleChoice?.role === "both") && validPick ? picked : null;
  if (lazada && !role) return back("role_required");
  // Lazada Sorteada (KIN-649): cuántos paquetes de tiros compra en cada rol (1 a 99). La base valida que solo ese tipo acepte más de uno y el monto
  // sale del costo de la categoría * paquetes, nunca del navegador. Los demás tipos de sorteo siguen con las firmas de siempre.
  const packages = Math.floor(Number(formData.get("packages") ?? 1));
  // KIN-793: en Lazada Sorteada los paquetes van POR LADO (cada lado con paquetes es una inscripción con su rol). Con un solo rol, el número de
  // `packages` (1 a 99) va a ese lado; con "los dos", `packages_header` y `packages_heeler` (0 a 99 cada uno, al menos 1 en total). La base lo vuelve a validar.
  const bySide = lazada;
  const sidePackages = (name: string) => { const n = Number(formData.get(name) ?? ""); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : -1; };
  let header = 0, heeler = 0;
  if (lazada && role === "both") {
    header = sidePackages("packages_header");
    heeler = sidePackages("packages_heeler");
    if (header < 0 || heeler < 0 || header + heeler < 1) return back("packages_side");
  } else if (lazada) {
    if (!Number.isInteger(packages) || packages < 1 || packages > 99) return back("invalid_packages");
    header = role === "header" ? packages : 0;
    heeler = role === "heeler" ? packages : 0;
  }
  return { l, s, event: { ...event, uuid: event.uuid }, category, role, packages: Number.isFinite(packages) ? packages : 0, bySide, header, heeler, back };
}

// Con paquetes por lado, un error de paquetes de la base se muestra con el mensaje de ese formulario (0 a 99 por lado y al menos 1 en total).
const sideCodeOf = (message: string) => { const code = codeOf(message); return code === "invalid_packages" ? "packages_side" : code; };

// Inscribirse a un evento. La base valida todo (evento publicado, categoría del evento, no repetir, cupo con bloqueo) y el precio
// sale de la categoría, nunca del navegador. Queda en "pendiente" hasta que exista el pago.
export async function enroll(formData: FormData) {
  const { l, s, event, category, role, bySide, header, heeler, back } = await enrollmentInput(formData);
  if (bySide) { // Lazada Sorteada: rol y paquetes por lado (KIN-793)
    const { error } = await (await createServerSupabase()).rpc("register_for_event_by_side", { p_event: event.uuid, p_category: category, p_header_packages: header, p_heeler_packages: heeler });
    if (error) return back(sideCodeOf(error.message));
    updateTag("registrations");
    redirect(`/${l}/mi-cuenta?inscrito=1`);
  }
  const args = s.roleChoice?.role === "both" ? { p_event: event.uuid, p_category: category, p_role: role } : { p_event: event.uuid, p_category: category };
  const { error } = await (await createServerSupabase()).rpc("register_for_event", args);
  if (error) return back(codeOf(error.message));
  updateTag("registrations");
  redirect(`/${l}/mi-cuenta?inscrito=1`);
}

// Entrar a la lista de espera de un evento lleno (KIN-726). La base solo la acepta si inscribirse hoy fallaría por cupo y aplica las mismas reglas
// (ventana de inscripción, categoría, rol, rating máximo, no repetir). Esperar no ocupa lugar ni se cobra. Si ya hay lugar, "not_full": hay que inscribirse normal.
export async function joinWaitlist(formData: FormData) {
  const { l, event, category, role, bySide, header, heeler, back } = await enrollmentInput(formData);
  if (bySide) { // Lazada Sorteada: rol y paquetes por lado (KIN-793)
    const { error } = await (await createServerSupabase()).rpc("join_waitlist_by_side", { p_event: event.uuid, p_category: category, p_header_packages: header, p_heeler_packages: heeler });
    if (error) return back(sideCodeOf(error.message));
    updateTag("registrations");
    redirect(`/${l}/mi-cuenta?espera=1`);
  }
  const { error } = await (await createServerSupabase()).rpc("join_waitlist", { p_event: event.uuid, p_category: category, p_role: role, p_packages: 1 });
  if (error) return back(codeOf(error.message));
  updateTag("registrations");
  redirect(`/${l}/mi-cuenta?espera=1`);
}

// La persona sale de la lista de espera (solo de la suya).
export async function leaveWaitlist(formData: FormData) {
  const l = lang(formData.get("lang"));
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect(`/${l}/mi-cuenta`);
  const { error } = await (await createServerSupabase()).rpc("leave_waitlist", { p_entry: id });
  if (!error) updateTag("registrations");
  redirect(`/${l}/mi-cuenta?${error ? `error=${codeOf(error.message)}` : "espera=salio"}`);
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

// Cambiar el rol de una inscripción propia (solo con perfil "Ambos" y mientras las inscripciones sigan abiertas; la base lo valida).
export async function changeRegistrationRole(formData: FormData) {
  const l = lang(formData.get("lang"));
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!UUID.test(id) || !["header", "heeler"].includes(role)) redirect(`/${l}/mi-cuenta`);
  const { error } = await (await createServerSupabase()).rpc("change_registration_role", { p_registration: id, p_role: role });
  if (!error) updateTag("registrations");
  redirect(`/${l}/mi-cuenta?${error ? `error=${codeOf(error.message)}` : "rolInscripcion=ok"}`);
}

// El organizador inscribe a un participante por su correo en un evento propio, también después del cierre de inscripciones (KIN-626).
// La base valida que el evento sea suyo y respeta cupo y categoría; la inscripción nace pendiente de pago.
export async function enrollByOrganizer(formData: FormData) {
  const l = lang(formData.get("lang"));
  const slug = String(formData.get("event") ?? "");
  const category = String(formData.get("category") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pickedRole = String(formData.get("role") ?? "");
  const role = ["header", "heeler", "both"].includes(pickedRole) ? pickedRole : null; // vacío = según el perfil (con "Ambos", su favorito)
  const packages = Math.floor(Number(formData.get("packages") || 1)); // solo Lazada Sorteada acepta más de uno (la base lo valida)
  const back = (q: string) => redirect(`/${l}/organizador/eventos/${encodeURIComponent(slug)}?${q}`);
  const s = await getSession();
  if (s?.role !== "organizador" || !s.verified) redirect(`/${l}/organizador`);
  if (!UUID.test(category) || email.length < 3 || email.length > 200) return back("manual=invalid");
  const supabase = await createServerSupabase();
  const { data: ev } = await supabase.from("events").select("id").eq("slug", slug).eq("organizer_id", s.id).maybeSingle();
  if (!ev) redirect(`/${l}/organizador`);
  const { error } = await supabase.rpc("organizer_enroll", { p_event: ev.id, p_email: email, p_category: category, p_role: role, p_packages: Number.isFinite(packages) ? packages : 0 });
  if (error) return back(`manual=${["not_found", "already", "full", "invalid_category", "invalid_role", "invalid_packages"].find((k) => error.message.includes(k)) ?? "failed"}`);
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
  const { data: removalId, error } = await supabase.rpc("remove_registration", { p_registration: id, p_reason: reason });
  if (error) return back(`sacado=${removeCode(error.message)}`);
  updateTag("registrations");
  // KIN-657: la base ya guardó el aviso dentro de la web; el correo sale aparte y, si falla, no deshace nada.
  type RemovalRow = { roper_id: string; reason: string; payment_status: string; events: { name: string; event_date: string | null; city: string | null; venue: string | null; organizer_name: string | null; organizer_id: string | null } | null };
  const { data: row } = await supabase.from("registration_removals").select("roper_id, reason, payment_status, events(name, event_date, city, venue, organizer_name, organizer_id)").eq("id", removalId as string).maybeSingle<RemovalRow>();
  if (row?.events) {
    const ev = row.events;
    after(() => emailParticipant({
      kind: "removed", roperId: row.roper_id, eventName: ev.name, eventDate: ev.event_date, place: [ev.venue, ev.city].filter(Boolean).join(", "),
      organizerId: ev.organizer_id, organizerName: ev.organizer_name ?? "", reason: row.reason, paid: row.payment_status === "pagado",
    }));
  }
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

// ---- Lista de espera del evento, del lado del organizador (KIN-726). La base valida que sea el organizador activo del evento (o un admin) y el cupo. ----
const WAITLIST_ERRORS = ["full", "closed", "already", "rating_limit", "invalid_category", "not_found"];
const waitlistCode = (message: string) => WAITLIST_ERRORS.find((k) => message.includes(k)) ?? "failed";

// Pasar a alguien de la lista de espera a inscrito. Solo si hay lugar; queda pendiente de pago y se le avisa dentro de la web y por correo.
export async function promoteWaitlistEntry(formData: FormData) {
  const { back, supabase } = await organizerContext(formData);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return back("espera=not_found");
  type Entry = { roper_id: string; events: { name: string; event_date: string | null; city: string | null; venue: string | null; organizer_name: string | null; organizer_id: string | null } | null };
  const { data: entry } = await supabase.from("event_waitlist").select("roper_id, events(name, event_date, city, venue, organizer_name, organizer_id)").eq("id", id).maybeSingle<Entry>();
  const { error } = await supabase.rpc("promote_waitlist_entry", { p_entry: id });
  if (error) return back(`espera=${waitlistCode(error.message)}`);
  updateTag("registrations");
  // El aviso dentro de la web ya lo guardó la base; el correo sale aparte y, si falla, no deshace nada.
  const ev = entry?.events;
  if (entry && ev) {
    after(() => emailParticipant({
      kind: "promoted", roperId: entry.roper_id, eventName: ev.name, eventDate: ev.event_date, place: [ev.venue, ev.city].filter(Boolean).join(", "),
      organizerId: ev.organizer_id, organizerName: ev.organizer_name ?? "", reason: "", paid: false,
    }));
  }
  return back("espera=ok");
}

// Quitar a alguien de la lista de espera.
export async function removeWaitlistEntry(formData: FormData) {
  const { back, supabase } = await organizerContext(formData);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return back("espera=not_found");
  const { error } = await supabase.rpc("remove_waitlist_entry", { p_entry: id });
  if (error) return back(`espera=${waitlistCode(error.message)}`);
  updateTag("registrations");
  return back("espera=removed");
}
