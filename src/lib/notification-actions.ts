"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marcar un aviso (id) o todos como leídos. La base solo deja tocar los propios (RLS y permiso de columna sobre read_at).
export async function markNotificationsRead(formData: FormData) {
  const l = formData.get("lang") === "en" ? "en" : "es";
  if (!(await getSession())) redirect(`/${l}/entrar`);
  const id = String(formData.get("id") ?? "");
  const q = (await createServerSupabase()).from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  await (UUID.test(id) ? q.eq("id", id) : q);
  // La campana y el banner viven en el encabezado (layout): sin esto se quedaban con el conteo viejo hasta cambiar de página.
  revalidatePath(`/${l}`, "layout");
  redirect(`/${l}/notificaciones`);
}
