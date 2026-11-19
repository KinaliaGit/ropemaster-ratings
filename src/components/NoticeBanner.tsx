import Link from "next/link";
import { getSession } from "@/lib/session";
import { countMyUnread } from "@/lib/data/notifications";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

// KIN-657: aviso visible al cargar cualquier página cuando hay avisos sin leer (p. ej. te sacaron de un evento), aunque no hayas abierto el correo.
// Va en Suspense: leer la sesión es acceso dinámico y no debe frenar el resto de la página.
export async function NoticeBanner({ lang, t }: { lang: Lang; t: Dict }) {
  if (!(await getSession())) return null;
  const n = await countMyUnread();
  if (n === 0) return null;
  return (
    <div role="status" className="bg-brand-soft px-5 py-2 text-center text-sm font-medium">
      {n === 1 ? t.notifications.bannerOne : t.notifications.bannerMany(n)} · <Link href={`/${lang}/notificaciones`} className="underline hover:text-brand-hot">{t.notifications.bannerLink}</Link>
    </div>
  );
}
