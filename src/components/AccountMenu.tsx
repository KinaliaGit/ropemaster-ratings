"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  initials: string; photo?: string | null; name: string; roleLabel: string; lang: "es" | "en";
  dashboardHref: string; dashboardLabel: string; signOutLabel: string;
  signOut: (formData: FormData) => void | Promise<void>;
};

// Avatar con menú desplegable. Se cierra al hacer clic fuera o con Escape.
export function AccountMenu({ initials, photo, name, roleLabel, lang, dashboardHref, dashboardLabel, signOutLabel, signOut }: Props) {
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
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={name}
        className="grid size-9 place-items-center overflow-hidden rounded-full bg-ink text-xs font-semibold text-white ring-offset-2 transition hover:bg-brand-hot focus-visible:ring-2 focus-visible:ring-ink">{photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} alt="" className="size-full object-cover" /> : initials}</button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-56 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(20,19,17,0.25)]">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-xs text-muted">{roleLabel}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" href={dashboardHref} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm hover:bg-sand">{dashboardLabel}</Link>
          <form action={signOut}>
            <input type="hidden" name="lang" value={lang} />
            <button role="menuitem" className="block w-full rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-sand hover:text-ink">{signOutLabel}</button>
          </form>
        </div>
      )}
    </div>
  );
}
