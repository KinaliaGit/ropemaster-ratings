import Link from "next/link";

export function Header() {
  return (
    <header className="bg-ink text-cream">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-ink">R</span>
          Rope Master <span className="font-mono text-xs font-medium text-brand">RATINGS</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/lazadores" className="hover:text-brand">Lazadores</Link>
          <Link href="/reclamar" className="hover:text-brand">Reclamar perfil</Link>
          <a href="https://kinalia.com.mx/es/productos/ropemaster" className="hidden rounded-full bg-brand px-4 py-2 font-semibold text-ink hover:bg-brand-hot sm:inline">
            Conoce Rope Master
          </a>
        </nav>
      </div>
    </header>
  );
}
