import { redirect } from "next/navigation";
import { getSession, type Role } from "@/lib/session";

// Protege una página: sin sesión manda a /entrar; con el rol equivocado, al inicio.
// Úsalo dentro de <Suspense> (leer la sesión es acceso dinámico).
export async function Gate({ role, next, children }: { role: Role; next: string; children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect(`/entrar?next=${encodeURIComponent(next)}&role=${role}`);
  if (s.role !== role) redirect("/");
  return <>{children}</>;
}

export async function GateSession({ role, next, children }: { role: Role; next: string; children: (s: NonNullable<Awaited<ReturnType<typeof getSession>>>) => React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect(`/entrar?next=${encodeURIComponent(next)}&role=${role}`);
  if (s.role !== role) redirect("/");
  return <>{children(s)}</>;
}
