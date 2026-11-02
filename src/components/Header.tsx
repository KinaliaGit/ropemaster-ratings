import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";

const link = "px-3 py-2 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-ink/80 transition hover:text-brand-hot";

async function AuthNav() {
  const s = await getSession();
  if (!s) return <Link href="/entrar" className="rounded-full bg-ink px-5 py-2.5 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-cream transition hover:bg-brand-hot">Entrar</Link>;
  return (
    <>
      <Link href={s.role === "organizador" ? "/organizador" : "/mi-cuenta"} className="rounded-full bg-ink px-5 py-2.5 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-cream transition hover:bg-brand-hot">
        {s.role === "organizador" ? "Mi panel" : "Mi cuenta"}
      </Link>
      <form action={logout}><button className={link}>Salir</button></form>
    </>
  );
}

// Navbar sin fondo (solo desenfoque) como el de Kinalia: flota sobre la página.
export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-bold">Rope Master</span>
          <span className="label hidden sm:inline">Ratings</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link href="/" className={link}>Eventos</Link>
          <Link href="/participantes" className={link}>Participantes</Link>
          <Suspense fallback={<span className="h-9 w-24" />}><AuthNav /></Suspense>
        </nav>
      </div>
    </header>
  );
}
