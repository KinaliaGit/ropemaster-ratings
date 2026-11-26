"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

// `exact`: solo activo en esa dirección. `except`: rutas hijas que ya tienen su propio enlace.
export type NavItem = { href: string; label: string; exact?: boolean; except?: string[] };

// Enlaces principales; la página actual queda resaltada.
export function NavLinks({ items }: { items: NavItem[] }) {
  return <Suspense fallback={<List items={items} current="" />}><Current items={items} /></Suspense>;
}

function Current({ items }: { items: NavItem[] }) {
  return <List items={items} current={usePathname() ?? ""} />;
}

const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

function List({ items, current }: { items: NavItem[]; current: string }) {
  return (
    <ul className="flex items-center gap-0.5 sm:gap-1">
      {items.map((i) => {
        const active = i.exact ? current === i.href : within(current, i.href) && !i.except?.some((x) => within(current, x));
        return (
          <li key={i.href}>
            <Link href={i.href} aria-current={active ? "page" : undefined}
              className={`relative block whitespace-nowrap rounded-full px-1.5 py-2 text-[13px] font-medium transition sm:px-3 sm:text-sm ${active ? "bg-ink/[0.06] text-ink" : "text-muted hover:text-ink"}`}>{i.label}</Link>
          </li>
        );
      })}
    </ul>
  );
}
