import { getSession } from "@/lib/session";
import { getMyUnread } from "@/lib/data/notifications";
import { NoticeWatcher } from "@/components/NoticeWatcher";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

// KIN-657: aviso visible al cargar cualquier página cuando hay avisos sin ver (p. ej. te sacaron de un evento), aunque no hayas abierto el correo.
// Va en Suspense: leer la sesión es acceso dinámico y no debe frenar el resto de la página.
export async function NoticeBanner({ lang, t }: { lang: Lang; t: Dict }) {
  const s = await getSession();
  if (!s) return null;
  const unread = (await getMyUnread()) ?? { count: 0, latest: null };
  const n = unread.count;
  return (
    <NoticeWatcher userId={s.id} count={n} latest={unread.latest} href={`/${lang}/notificaciones`}
      text={n === 1 ? t.notifications.bannerOne : t.notifications.bannerMany(n)} linkLabel={t.notifications.bannerLink} />
  );
}
