"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { isNewer, showBanner, type Unread } from "@/lib/notices";
import { playChime, unlockSound } from "@/lib/chime";

const POLL_MS = 30_000;
const CHANGED = "rm-avisos";

type Props = Unread & { userId: string; href: string; text: string; linkLabel: string };

// El texto de arriba se esconde en cuanto la persona entra a Avisos (queda el circulito de la campana hasta que los marque como leídos).
// Además consulta cada rato si cayó uno nuevo: suena y se actualiza la página. Lo visto se recuerda en este navegador, por cuenta.
export function NoticeWatcher({ userId, count, latest, href, text, linkLabel }: Props) {
  const router = useRouter();
  const onNotices = usePathname() === href;
  const seenKey = `rm-avisos-vistos:${userId}`;
  // En el servidor no se sabe qué se vio: `undefined` deja el texto oculto y así no parpadea al cargar.
  const seen = useSyncExternalStore(subscribe, () => localStorage.getItem(seenKey), () => undefined);

  useEffect(() => {
    if (!onNotices || !latest) return;
    localStorage.setItem(seenKey, latest);
    window.dispatchEvent(new Event(CHANGED));
  }, [onNotices, latest, seenKey]);

  // Lo último que se conoce. Un aviso «cae» igual si lo trae la consulta periódica o la propia página al actualizarse.
  const known = useRef<Unread>({ count, latest });
  const receive = useCallback((now: Unread) => {
    const before = known.current;
    known.current = now;
    if (!isNewer(now.latest, before.latest)) return;
    // Con varias pestañas abiertas suena una sola vez.
    const soundKey = `rm-avisos-sonado:${userId}`;
    if (localStorage.getItem(soundKey) !== now.latest && playChime()) localStorage.setItem(soundKey, now.latest!);
  }, [userId]);
  useEffect(() => receive({ count, latest }), [count, latest, receive]);

  useEffect(() => unlockSound(), []);

  useEffect(() => {
    const check = async () => {
      const res = await fetch("/api/avisos", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const now = (await res.json()) as Unread;
      const changed = now.count !== known.current.count || now.latest !== known.current.latest;
      receive(now);
      if (changed) router.refresh();
    };
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [router, receive]);

  if (onNotices || seen === undefined || !showBanner({ count, latest }, seen)) return null;
  return (
    <div role="status" className="bg-brand-soft px-5 py-2 text-center text-sm font-medium">
      {text} · <Link href={href} className="underline hover:text-brand-hot">{linkLabel}</Link>
    </div>
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener(CHANGED, onChange); window.removeEventListener("storage", onChange); };
}
