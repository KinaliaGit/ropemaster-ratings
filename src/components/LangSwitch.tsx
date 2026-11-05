"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

// Cambia de idioma conservando la misma página (/es/eventos/e1 ⇄ /en/eventos/e1).
// `inline`: versión para el pie de página (celular), sin flotar. Sin `inline`: píldora flotante, solo en pantallas desde `sm` (en celular se
// encimaría con barras fijas como la de inscripción).
export function LangSwitch({ lang, label, inline = false }: { lang: "es" | "en"; label: string; inline?: boolean }) {
  return <Suspense fallback={<Switch lang={lang} label={label} rest="" inline={inline} />}><Current lang={lang} label={label} inline={inline} /></Suspense>;
}

function Current({ lang, label, inline }: { lang: "es" | "en"; label: string; inline: boolean }) {
  const pathname = usePathname() ?? `/${lang}`;
  return <Switch lang={lang} label={label} rest={pathname.replace(/^\/(es|en)/, "")} inline={inline} />;
}

// Selector flotante fijo abajo a la derecha: dos opciones en una píldora, la activa resaltada.
function Switch({ lang, label, rest, inline }: { lang: "es" | "en"; label: string; rest: string; inline: boolean }) {
  return (
    <div role="group" aria-label={label}
      className={`items-center gap-0.5 rounded-full border border-line bg-white/90 p-1 text-xs font-semibold backdrop-blur ${inline ? "inline-flex" : "fixed bottom-6 right-6 z-40 hidden shadow-[0_6px_20px_-8px_rgba(20,19,17,0.3)] sm:flex"}`}>
      {(["es", "en"] as const).map((l) => (
        <Link key={l} href={`/${l}${rest}`} hrefLang={l} aria-current={l === lang ? "true" : undefined}
          className={`rounded-full px-3.5 py-2 uppercase transition ${l === lang ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>{l}</Link>
      ))}
    </div>
  );
}
