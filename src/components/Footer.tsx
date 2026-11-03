import type { Dict } from "@/dictionaries/es";
import { productUrl, licensesUrl } from "@/lib/links";

export function Footer({ t, lang }: { t: Dict; lang: "es" | "en" }) {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{t.footer.tagline}</p>
        <nav className="flex gap-5">
          <a href={productUrl(lang)} target="_blank" rel="noopener noreferrer" className="hover:text-ink">{t.footer.product} ↗</a>
          <a href={licensesUrl(lang)} target="_blank" rel="noopener noreferrer" className="hover:text-ink">{t.footer.licenses} ↗</a>
        </nav>
      </div>
    </footer>
  );
}
