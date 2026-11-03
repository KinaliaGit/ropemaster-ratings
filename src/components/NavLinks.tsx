"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

// Enlaces principales; la página actual queda resaltada.
export function NavLinks({ items }: { items: Item[] }) {
  return <Suspense fallback={<List items={items} current="" />}><Current items={items} /></Suspense>;
}

function Current({ items }: { items: Item[] }) {
  return <List items={items} current={usePathname() ?? ""} />;
}

function List({ items, current }: { items: Item[]; current: string }) {
  return (
    <ul className="flex items-center gap-1">
      {items.map((i, idx) => {
        // El inicio (/es, /en) solo cuenta como activo en coincidencia exacta.
        const active = idx === 0 ? current === i.href : current === i.href || current.startsWith(`${i.href}/`);
        return (
          <li key={i.href}>
            <Link href={i.href} aria-current={active ? "page" : undefined}
              className={`relative rounded-full px-3 py-2 text-sm font-medium transition ${active ? "bg-ink/[0.06] text-ink" : "text-muted hover:text-ink"}`}>{i.label}</Link>
          </li>
        );
      })}
    </ul>
  );
}
