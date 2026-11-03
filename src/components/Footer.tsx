import type { Dict } from "@/dictionaries/es";

export function Footer({ t }: { t: Dict }) {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{t.footer.tagline}</p>
        <nav className="flex gap-5">
          <a href="https://kinalia.com.mx/es/productos/ropemaster" className="hover:text-ink">{t.footer.product} ↗</a>
        </nav>
      </div>
    </footer>
  );
}
