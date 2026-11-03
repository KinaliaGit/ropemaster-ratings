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

function Switch({ lang, label, rest }: { lang: "es" | "en"; label: string; rest: string }) {
  return (
    <div aria-label={label} className="flex rounded-full border border-line p-0.5 text-xs font-semibold">
      {(["es", "en"] as const).map((l) => (
        <Link key={l} href={`/${l}${rest}`} hrefLang={l} aria-current={l === lang ? "true" : undefined}
          className={`rounded-full px-2.5 py-1 uppercase ${l === lang ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{l}</Link>
      ))}
    </div>
  );
}
