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
  if (session?.role !== "organizador" || session.demo) redirect(`/${l}/entrar?role=organizador`);

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

  updateTag("events");
  redirect(`/${l}/organizador/eventos/${eventSlug}?nuevo=${status}`);
}

// Publica un borrador o lo regresa a borrador. La base solo deja cambiar eventos propios.
export async function setEventStatus(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await getSession();
  const eventSlug = text(formData.get("id"), 80);
  if (session?.role !== "organizador" || session.demo || !eventSlug) redirect(`/${l}/organizador`);

  const supabase = await createServerSupabase();
  const { data: current } = await supabase.from("events").select("id, status").eq("slug", eventSlug).eq("organizer_id", session.id).maybeSingle();
  if (!current || current.status === "finalizado") redirect(`/${l}/organizador`);

  const next = current.status === "borrador" ? "publicado" : "borrador";
  await supabase.from("events").update({ status: next }).eq("id", current.id);
  updateTag("events");
  redirect(`/${l}/organizador/eventos/${eventSlug}${next === "publicado" ? "?nuevo=publicado" : ""}`);
}
