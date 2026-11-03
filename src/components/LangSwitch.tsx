"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

// Cambia de idioma conservando la misma página (/es/eventos/e1 ⇄ /en/eventos/e1).
export function LangSwitch({ lang, label }: { lang: "es" | "en"; label: string }) {
  return <Suspense fallback={<Switch lang={lang} label={label} rest="" />}><Current lang={lang} label={label} /></Suspense>;
}

function Current({ lang, label }: { lang: "es" | "en"; label: string }) {
  const pathname = usePathname() ?? `/${lang}`;
  return <Switch lang={lang} label={label} rest={pathname.replace(/^\/(es|en)/, "")} />;
}

// Dos códigos en texto sencillo: el activo en negro, el otro apagado.
function Switch({ lang, label, rest }: { lang: "es" | "en"; label: string; rest: string }) {
  return (
    <div aria-label={label} className="flex items-center gap-1.5 text-xs font-semibold">
      {(["es", "en"] as const).map((l, i) => (
        <span key={l} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="h-3 w-px bg-line" />}
          <Link href={`/${l}${rest}`} hrefLang={l} aria-current={l === lang ? "true" : undefined}
            className={`uppercase transition ${l === lang ? "text-ink" : "text-muted hover:text-ink"}`}>{l}</Link>
        </span>
      ))}
    </div>
  );
}
