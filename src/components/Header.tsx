import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";

const link = "px-3 py-2 text-sm font-medium text-ink/70 transition hover:text-ink";
const cta = "rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hot";

async function AuthNav() {
  const s = await getSession();
  if (!s) return <Link href="/entrar" className={cta}>Entrar</Link>;
  return (
    <>
      <Link href={s.role === "organizador" ? "/organizador" : "/mi-cuenta"} className={cta}>{s.role === "organizador" ? "Mi panel" : "Mi cuenta"}</Link>
      <form action={logout}><button className={link}>Salir</button></form>
    </>
  );
}

// Navbar sin fondo: solo desenfoque, flota sobre la página.
export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="size-2.5 rounded-full bg-brand" />Rope Master<span className="hidden font-normal text-muted sm:inline">Ratings</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/" className={link}>Eventos</Link>
          <Link href="/participantes" className={link}>Participantes</Link>
          <Suspense fallback={<span className="h-9 w-20" />}><AuthNav /></Suspense>
        </nav>
      </div>
    </header>
  );
}
