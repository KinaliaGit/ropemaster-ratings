"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Menú ☰ de quien visita sin cuenta, solo en celular: ahí los enlaces no caben junto a la marca y a «Entrar».
export function GuestMenu({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={label} className="grid size-11 place-items-center rounded-full border border-line bg-white">
        <svg aria-hidden viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{open ? <path d="m5 5 10 10M15 5 5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}</svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-56 rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(20,19,17,0.25)]">
          {items.map((x) => <Link key={x.href} role="menuitem" href={x.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm hover:bg-sand">{x.label}</Link>)}
        </div>
      )}
    </div>
  );
}
