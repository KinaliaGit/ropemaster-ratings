import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";

const link = "rounded-full px-3 py-2 hover:bg-white/10";

async function AuthNav() {
  const s = await getSession();
  if (!s) return <Link href="/entrar" className="rounded-full bg-brand px-4 py-2 font-semibold text-ink hover:bg-brand-hot">Entrar</Link>;
  return (
    <>
      <Link href={s.role === "organizador" ? "/organizador" : "/mi-cuenta"} className="rounded-full bg-brand px-4 py-2 font-semibold text-ink hover:bg-brand-hot">
        {s.role === "organizador" ? "Mi panel" : "Mi cuenta"}
      </Link>
      <form action={logout}><button className={link}>Salir</button></form>
    </>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-10 bg-ink text-cream">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-ink">R</span>
          Rope Master <span className="hidden font-mono text-xs font-medium text-brand sm:inline">RATINGS</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/" className={link}>Eventos</Link>
          <Link href="/participantes" className={link}>Participantes</Link>
          <Suspense fallback={<span className="h-9 w-20" />}><AuthNav /></Suspense>
        </nav>
      </div>
    </header>
  );
}
