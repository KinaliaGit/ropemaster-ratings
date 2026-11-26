"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  initials: string; photo?: string | null; name: string; roleLabel: string; lang: "es" | "en";
  dashboardHref: string; dashboardLabel: string; extras?: { href: string; label: string; className?: string; separated?: boolean }[]; signOutLabel: string;
  signOut: (formData: FormData) => void | Promise<void>;
};

// Avatar con menú desplegable. Se cierra al hacer clic fuera o con Escape.
export function AccountMenu({ initials, photo, name, roleLabel, lang, dashboardHref, dashboardLabel, extras = [], signOutLabel, signOut }: Props) {
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
    <div ref={ref} className="relative">
      {/* En celular es el menú de toda la web: la foto va junto a las tres rayas para que se note que se abre. */}
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={name}
        className="group flex items-center gap-2 rounded-full border border-line bg-white py-0.5 pl-3 pr-0.5 ring-offset-2 focus-visible:ring-2 focus-visible:ring-ink sm:border-0 sm:bg-transparent sm:p-0">
        <svg aria-hidden viewBox="0 0 20 20" className="size-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{open ? <path d="m5 5 10 10M15 5 5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}</svg>
        <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-ink text-xs font-semibold text-white transition group-hover:bg-brand-hot">{photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt="" className="size-full object-cover" /> : initials}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 max-h-[calc(100dvh-5rem)] w-60 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(20,19,17,0.25)]">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs text-muted">{roleLabel}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" href={dashboardHref} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm hover:bg-sand">{dashboardLabel}</Link>
          {extras.map((x) => <Link key={x.href} role="menuitem" href={x.href} onClick={() => setOpen(false)} className={`block rounded-xl px-3 py-2 text-sm hover:bg-sand ${x.separated ? "mt-1 border-t border-line" : ""} ${x.className ?? ""}`}>{x.label}</Link>)}
          <form action={signOut}>
            <input type="hidden" name="lang" value={lang} />
            <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-sand hover:text-ink">{signOutLabel}</button>
          </form>
        </div>
      )}
    </div>
  );
}
