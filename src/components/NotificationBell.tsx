"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { badgeText, bellState } from "@/lib/bell";
import { NOTICES_CHANGED, seenKeyFor } from "@/lib/notices";
import { markBellRead } from "@/lib/notification-actions";

export type BellItem = { id: string; title: string; dateLabel: string; reason: string | null; read: boolean; refundPending: boolean };
type Labels = { bell: string; title: string; empty: string; markAll: string; markRead: string; isNew: string; viewAll: string; refund: string; reason: string };

// La campana de avisos del encabezado: al picarle se abre un menú con los últimos avisos (los vistos y los nuevos) para marcarlos como leídos sin salir
// de la página; para ver todos hay un enlace a Avisos. Abrirla cuenta como «verlos»: el texto de arriba (NoticeBanner) se esconde igual que al entrar a Avisos.
// Se cierra al hacer clic fuera o con Escape. Marcar como leído baja el circulito al momento; la base confirma y la página se actualiza.
export function NotificationBell({ lang, userId, href, items, total, unread, latest, labels }: {
  lang: "es" | "en"; userId: string; href: string; items: BellItem[]; total: number; unread: number; latest: string | null; labels: Labels;
}) {
  const [open, setOpen] = useState(false);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const [allMarked, setAllMarked] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    if (!open && latest) {
      localStorage.setItem(seenKeyFor(userId), latest);
      window.dispatchEvent(new Event(NOTICES_CHANGED));
    }
    setOpen((o) => !o);
  };

  const isRead = (i: BellItem) => i.read || allMarked || marked.has(i.id);
  const markedHere = allMarked ? unread : items.filter((i) => !i.read && marked.has(i.id)).length;
  const state = bellState({ unread, total, shown: items.length, markedHere });
  const markOne = (id: string) => { setMarked((m) => new Set(m).add(id)); start(() => { void markBellRead(lang, id); }); };
  const markAll = () => { setAllMarked(true); start(() => { void markBellRead(lang); }); };

  return (
    <div ref={ref} className="relative mr-2">
      <button type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open}
        aria-label={state.unread > 0 ? `${labels.bell} (${state.unread})` : labels.bell}
        className="relative grid size-9 place-items-center rounded-full hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {state.unread > 0 && <span data-testid="bell-badge" className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-brand-hot px-1 text-[10px] font-semibold leading-4 text-white">{badgeText(state.unread)}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label={labels.title} data-testid="bell-panel"
          className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-line bg-white shadow-[0_12px_32px_-12px_rgba(20,19,17,0.25)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-semibold">{labels.title}</p>
            {state.unread > 0 && <button type="button" onClick={markAll} disabled={pending} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-ink disabled:opacity-60">{labels.markAll}</button>}
          </div>
          <div className="h-px bg-line" />
          {items.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">{labels.empty}</p> : (
            <ul className="divide-y divide-line">
              {items.map((i) => {
                const read = isRead(i);
                return (
                  <li key={i.id} className={`px-4 py-3 ${read ? "" : "bg-brand-soft/40"}`} aria-label={i.title}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-medium">{i.title}</p>
                      {!read && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-hot">{labels.isNew}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{i.dateLabel}</p>
                    {i.reason && <p className="mt-1 line-clamp-2 break-words text-xs"><span className="font-medium">{labels.reason}</span> {i.reason}</p>}
                    {i.refundPending && <p className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">{labels.refund}</p>}
                    {!read && <div className="mt-2"><button type="button" onClick={() => markOne(i.id)} disabled={pending} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium hover:border-ink disabled:opacity-60">{labels.markRead}</button></div>}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="h-px bg-line" />
          <Link href={href} onClick={() => setOpen(false)} className="block px-4 py-3 text-center text-sm font-medium hover:bg-sand">
            {labels.viewAll}{state.hasMore ? ` (${total})` : ""}
          </Link>
        </div>
      )}
    </div>
  );
}
