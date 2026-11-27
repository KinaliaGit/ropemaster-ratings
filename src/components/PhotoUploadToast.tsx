"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { photoUploads } from "@/lib/photo-upload";
import { IDLE_UPLOADS } from "@/lib/photo-queue";

type Labels = { uploading: string; done: string; failed: string; close: string };
const fill = (text: string, vars: Record<string, number>) => text.replace(/\{(\w)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

// Aviso abajo de cualquier pantalla con el avance de las fotos que se suben en segundo plano (KIN-774). Vive en el layout, así sigue visible al cambiar de página.
// Al terminar refresca la pantalla para que aparezcan las fotos; si todo salió bien se oculta solo, y si alguna falló se queda hasta cerrarlo.
export function PhotoUploadToast({ labels: l }: { labels: Labels }) {
  const router = useRouter();
  const snap = useSyncExternalStore(photoUploads.subscribe, photoUploads.getSnapshot, () => IDLE_UPLOADS);
  const refreshed = useRef(false);

  // Mientras suben, avisa si la persona intenta cerrar o recargar la pestaña (las fotos viven en el navegador y se perderían).
  useEffect(() => {
    if (!snap.active) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [snap.active]);

  // Al terminar: una sola vez, refresca para que se vean las fotos; si no hubo fallas, se oculta a los pocos segundos.
  useEffect(() => {
    if (!snap.finished) { refreshed.current = false; return; }
    if (!refreshed.current) { refreshed.current = true; router.refresh(); }
    if (snap.failed > 0) return;
    const t = setTimeout(() => photoUploads.dismiss(), 5000);
    return () => clearTimeout(t);
  }, [snap.finished, snap.failed, router]);

  if (!snap.active && !snap.finished) return null;
  const failed = snap.finished && snap.failed > 0;
  return (
    <div role="status" aria-live="polite" data-testid="photo-upload-toast"
      className="fixed bottom-20 left-1/2 z-50 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm shadow-[0_12px_32px_-12px_rgba(20,19,17,0.35)] sm:bottom-6">
      {snap.active ? (
        <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-brand" />
      ) : (
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${failed ? "bg-red-600" : "bg-green-600"}`} />
      )}
      <p className={`min-w-0 flex-1 ${failed ? "text-red-800" : ""}`}>
        {snap.active ? fill(l.uploading, { d: snap.done, t: snap.total }) : failed ? fill(l.failed, { n: snap.failed }) : l.done}
      </p>
      {snap.finished && <button type="button" onClick={() => photoUploads.dismiss()} className="min-h-8 shrink-0 rounded-full px-3 text-xs font-medium text-muted hover:text-ink">{l.close}</button>}
    </div>
  );
}
