import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { buildNoticeEmail, type Lang2, type NoticeKind } from "@/lib/notify-emails";

// Correo de aviso al participante (KIN-657/660). Se llama DESPUÉS de que la base ya guardó la salida y el aviso dentro de la web, y nunca lanza:
// si falta la llave de servicio, la persona no tiene cuenta o el correo falla, la acción principal sigue valiendo.
export type Notice = { kind: NoticeKind; roperId: string; eventName: string; eventDate: string | null; place: string; organizerId: string | null; organizerName: string; reason: string; paid: boolean };

export async function emailParticipant(n: Notice): Promise<boolean> {
  try {
    const admin = adminClient();
    if (!admin) return false;
    const { data: roper } = await admin.from("ropers").select("full_name, user_id").eq("id", n.roperId).maybeSingle();
    if (!roper?.user_id) return false; // sin cuenta no hay correo confiable (el contacto del perfil no se verifica)
    const [{ data: user }, organizer] = await Promise.all([
      admin.auth.admin.getUserById(roper.user_id),
      n.organizerId ? admin.auth.admin.getUserById(n.organizerId) : Promise.resolve(null),
    ]);
    const to = user?.user?.email;
    if (!to) return false;
    const lang: Lang2 = user?.user?.user_metadata?.lang === "en" ? "en" : "es";
    const mail = buildNoticeEmail({
      kind: n.kind, lang, name: roper.full_name, eventName: n.eventName, eventDate: n.eventDate, place: n.place, organizer: n.organizerName,
      contact: organizer?.data?.user?.email ?? null, reason: n.reason, paid: n.paid,
    });
    return await sendEmail({ to, ...mail });
  } catch (e) {
    console.error("[notify] no se pudo avisar por correo", e instanceof Error ? e.message : e);
    return false;
  }
}
