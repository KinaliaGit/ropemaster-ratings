"use server";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function slug(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "evento";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// Crea el evento (borrador o publicado) en la base y lleva al organizador a su pantalla, donde está el enlace para compartir.
// Las reglas de la base garantizan que solo un organizador cree eventos a su nombre.
export async function createEvent(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  if (!session.verified) redirect(`/${l}/organizador`); // sin licencia vigente ni aprobación no se crean eventos (la base también lo impone)

  const name = text(formData.get("name"), 120);
  const date = text(formData.get("date"), 10);
  const city = text(formData.get("city"), 80);
  const venue = text(formData.get("venue"), 120);
  const capacity = Math.floor(Number(formData.get("capacity")));
  const names = formData.getAll("catName").map((v) => text(v, 60));
  const fees = formData.getAll("catFee").map((v) => Math.max(0, Math.floor(Number(v)) || 0));
  const categories = names.map((n, i) => ({ name: n, fee: fees[i] ?? 0 })).filter((c) => c.name);
  const disciplines = formData.getAll("discipline").map(String).filter((d) => ACTIVE_DISCIPLINES.some((a) => a.id === d));

  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !city || !venue || !(capacity > 0) || categories.length === 0 || disciplines.length === 0) {
    redirect(`/${l}/organizador/eventos/nuevo?error=1`);
  }

  const status = formData.get("intent") === "publish" ? "publicado" : "borrador";
  const supabase = await createServerSupabase();
  const id = crypto.randomUUID();
  const eventSlug = slug(name);

  const { error } = await supabase.from("events").insert({
    id, slug: eventSlug, name, event_date: date, city, venue, capacity, disciplines, status,
    description: text(formData.get("description"), 1000), organizer_id: session.id, organizer_name: session.name,
  });
  if (error) redirect(`/${l}/organizador/eventos/nuevo?error=1`);

  const { error: catError } = await supabase.from("event_categories").insert(categories.map((c) => ({ event_id: id, name: c.name, fee_cents: c.fee * 100 })));
  if (catError) {
    await supabase.from("events").delete().eq("id", id); // no dejar un evento sin categorías
    redirect(`/${l}/organizador/eventos/nuevo?error=1`);
  }

  await savePaymentInfo(supabase, id, formData.get("paymentInfo"));
  updateTag("events");
  redirect(`/${l}/organizador/eventos/${eventSlug}?nuevo=${status}`);
}

// Instrucciones de pago (transferencia/efectivo): solo las ven el organizador y quienes se inscriben. Vacío = se borran.
async function savePaymentInfo(supabase: Awaited<ReturnType<typeof createServerSupabase>>, eventId: string, raw: FormDataEntryValue | null) {
  const instructions = text(raw, 1000);
  if (!instructions) await supabase.from("event_payment_info").delete().eq("event_id", eventId);
  else await supabase.from("event_payment_info").upsert({ event_id: eventId, instructions, updated_at: new Date().toISOString() });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Edita un evento propio (datos, modalidades y categorías). No cambia el estado ni el enlace. Reglas:
//  - el cupo no puede quedar por debajo de los inscritos;
//  - una categoría con inscritos no se puede quitar (sí se puede renombrar o cambiar su costo; lo ya inscrito conserva el precio con el que se apartó);
//  - un evento finalizado ya no se edita.
export async function updateEvent(formData: FormData) {
  const l = lang(formData.get("lang"));
  const eventSlug = text(formData.get("slug"), 80);
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);
  if (!session.verified) redirect(`/${l}/organizador`);
  const back = (error: string) => redirect(`/${l}/organizador/eventos/${eventSlug}/editar?error=${error}`);

  const supabase = await createServerSupabase();
  const { data: ev } = await supabase.from("events").select("id, status").eq("slug", eventSlug).eq("organizer_id", session.id).maybeSingle();
  if (!ev || ev.status === "finalizado") redirect(`/${l}/organizador`);

  const name = text(formData.get("name"), 120);
  const date = text(formData.get("date"), 10);
  const city = text(formData.get("city"), 80);
  const venue = text(formData.get("venue"), 120);
  const capacity = Math.floor(Number(formData.get("capacity")));
  const ids = formData.getAll("catId").map(String);
  const names = formData.getAll("catName").map((v) => text(v, 60));
  const fees = formData.getAll("catFee").map((v) => Math.max(0, Math.floor(Number(v)) || 0));
  const rows = names.map((n, i) => ({ id: UUID.test(ids[i] ?? "") ? ids[i] : null, name: n, fee: fees[i] ?? 0 })).filter((c) => c.name);
  const disciplines = formData.getAll("discipline").map(String).filter((d) => ACTIVE_DISCIPLINES.some((a) => a.id === d));
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !city || !venue || !(capacity > 0) || rows.length === 0 || disciplines.length === 0) return back("1");

  const [{ count: enrolled }, { data: current }, { data: used }] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
    supabase.from("event_categories").select("id").eq("event_id", ev.id),
    supabase.from("registrations").select("category_id").eq("event_id", ev.id),
  ]);
  if (capacity < (enrolled ?? 0)) return back("capacity");
  const keep = new Set(rows.map((r) => r.id).filter(Boolean));
  const usedIds = new Set((used ?? []).map((r) => r.category_id));
  const toDelete = (current ?? []).map((c) => c.id).filter((id) => !keep.has(id));
  if (toDelete.some((id) => usedIds.has(id))) return back("catInUse");
  const owned = new Set((current ?? []).map((c) => c.id));

  const { error } = await supabase.from("events").update({ name, event_date: date, city, venue, capacity, disciplines, description: text(formData.get("description"), 1000) }).eq("id", ev.id);
  if (error) return back("1");
  for (const r of rows) {
    if (r.id && owned.has(r.id)) await supabase.from("event_categories").update({ name: r.name, fee_cents: r.fee * 100 }).eq("id", r.id);
    else await supabase.from("event_categories").insert({ event_id: ev.id, name: r.name, fee_cents: r.fee * 100 });
  }
  if (toDelete.length) await supabase.from("event_categories").delete().in("id", toDelete);
  await savePaymentInfo(supabase, ev.id, formData.get("paymentInfo"));

  updateTag("events");
  updateTag("registrations");
  redirect(`/${l}/organizador/eventos/${eventSlug}?editado=1`);
}

// Publica un borrador o lo regresa a borrador. La base solo deja cambiar eventos propios.
export async function setEventStatus(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await getSession();
  const eventSlug = text(formData.get("id"), 80);
  if (session?.role !== "organizador" || !eventSlug) redirect(`/${l}/organizador`);

  const supabase = await createServerSupabase();
  const { data: current } = await supabase.from("events").select("id, status").eq("slug", eventSlug).eq("organizer_id", session.id).maybeSingle();
  if (!current || current.status === "finalizado") redirect(`/${l}/organizador`);

  const next = current.status === "borrador" ? "publicado" : "borrador";
  await supabase.from("events").update({ status: next }).eq("id", current.id);
  updateTag("events");
  redirect(`/${l}/organizador/eventos/${eventSlug}${next === "publicado" ? "?nuevo=publicado" : ""}`);
}
