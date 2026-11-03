import { redirect } from "next/navigation";
import { getSession, type Role, type Session } from "@/lib/session";
import type { Lang } from "@/lib/format";

// Protege una página: sin sesión manda a /entrar (con ?next); con el rol equivocado, al inicio.
// Úsalo dentro de <Suspense> (leer la sesión es acceso dinámico).
export async function Gate({ lang, role, next, children }: { lang: Lang; role: Role; next: string; children: (s: Session) => React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect(`/${lang}/entrar?next=${encodeURIComponent(next)}&role=${role}`);
  if (s.role !== role) redirect(`/${lang}`);
  return <>{children(s)}</>;
}
