"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; match?: string[] };

// Pestañas del panel del organizador: barra con fondo, la sección actual resaltada.
export function OrgTabs({ tabs, publicHref, publicLabel }: { tabs: Tab[]; publicHref: string; publicLabel: string }) {
  return <Suspense fallback={<Bar tabs={tabs} current="" publicHref={publicHref} publicLabel={publicLabel} />}><Current tabs={tabs} publicHref={publicHref} publicLabel={publicLabel} /></Suspense>;
}

function Current(props: { tabs: Tab[]; publicHref: string; publicLabel: string }) {
  return <Bar {...props} current={usePathname() ?? ""} />;
}

function Bar({ tabs, current, publicHref, publicLabel }: { tabs: Tab[]; current: string; publicHref: string; publicLabel: string }) {
  return (
    <nav aria-label="Panel" className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-6">
      <div className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-sand p-1">
        {tabs.map((t) => {
          const active = current === t.href || (t.match ?? []).some((m) => current === m || current.startsWith(`${m}/`));
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${active ? "bg-white text-ink shadow-[0_1px_3px_rgba(20,19,17,0.12)]" : "text-ink/65 hover:bg-white/60 hover:text-ink"}`}>{t.label}</Link>
          );
        })}
      </div>
      <Link href={publicHref} className="hidden whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm font-medium transition hover:border-ink sm:block">{publicLabel} ↗</Link>
    </nav>
  );
}
