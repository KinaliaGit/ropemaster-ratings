import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-10 bg-ink text-cream">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-ink">R</span>
          Rope Master <span className="hidden font-mono text-xs font-medium text-brand sm:inline">RATINGS</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/" className="rounded-full px-3 py-2 hover:bg-white/10">Eventos</Link>
          <Link href="/participantes" className="rounded-full px-3 py-2 hover:bg-white/10">Participantes</Link>
          <Link href="/organizador" className="hidden rounded-full px-3 py-2 hover:bg-white/10 md:block">Organizadores</Link>
          <Link href="/entrar" className="rounded-full bg-brand px-4 py-2 font-semibold text-ink hover:bg-brand-hot">Entrar</Link>
        </nav>
      </div>
    </header>
  );
}
