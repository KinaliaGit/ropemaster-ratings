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

// Selector flotante fijo abajo a la derecha: dos opciones en una píldora, la activa resaltada.
function Switch({ lang, label, rest }: { lang: "es" | "en"; label: string; rest: string }) {
  return (
    <div role="group" aria-label={label}
      className="fixed bottom-4 right-4 z-40 flex items-center gap-0.5 rounded-full border border-line bg-white/90 p-1 text-xs font-semibold shadow-[0_6px_20px_-8px_rgba(20,19,17,0.3)] backdrop-blur sm:bottom-6 sm:right-6">
      {(["es", "en"] as const).map((l) => (
        <Link key={l} href={`/${l}${rest}`} hrefLang={l} aria-current={l === lang ? "true" : undefined}
          className={`rounded-full px-3.5 py-2 uppercase transition ${l === lang ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{l}</Link>
      ))}
    </div>
  );
}
