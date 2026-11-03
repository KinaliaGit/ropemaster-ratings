"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { events, type EventItem } from "@/lib/mock";
import { getSession } from "@/lib/session";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";

const lang = (v: FormDataEntryValue | null) => (v === "en" ? "en" : "es");
const text = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function slug(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "evento";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

// Crea el evento (borrador o publicado) y lleva al organizador a su pantalla, donde está el enlace para compartir.
// TODO: guardar en Supabase (events + event_categories) y subir la portada a Storage.
export async function createEvent(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await getSession();
  if (session?.role !== "organizador") redirect(`/${l}/entrar?role=organizador`);

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

  const id = slug(name);
  const e: EventItem = {
    id, name, date, city, venue, disciplines, categories, capacity, registered: [], organizer: session.id,
    tone: events.length % 3, photos: [], updatedAt: new Date().toISOString(), description: text(formData.get("description"), 1000),
    status: formData.get("intent") === "publish" ? "publicado" : "borrador",
  };
  events.unshift(e);
  revalidatePath("/", "layout");
  redirect(`/${l}/organizador/eventos/${id}?nuevo=${e.status === "publicado" ? "publicado" : "borrador"}`);
}

// Publica un borrador o lo regresa a borrador. Solo el organizador dueño del evento.
export async function setEventStatus(formData: FormData) {
  const l = lang(formData.get("lang"));
  const session = await getSession();
  const e = events.find((x) => x.id === formData.get("id"));
  if (session?.role !== "organizador" || !e || e.organizer !== session.id || e.status === "finalizado") redirect(`/${l}/organizador`);
  e.status = e.status === "borrador" ? "publicado" : "borrador";
  e.updatedAt = new Date().toISOString();
  revalidatePath("/", "layout");
  redirect(`/${l}/organizador/eventos/${e.id}${e.status === "publicado" ? "?nuevo=publicado" : ""}`);
}
