// Cola de subida de fotos en segundo plano (KIN-774). Al crear un evento con fotos, el formulario NO se queda esperando: mete las fotos aquí, abre el evento de inmediato y la cola las
// sube una por una (la primera queda de portada) mientras la persona ya navega. Un aviso en cualquier pantalla muestra el avance (ver PhotoUploadToast).
// Esta parte no depende de React ni de Next para poder probarla con `node --test` (ver tests/photo-queue.test.mjs): recibe la función que sube una foto.

export type UploadSnapshot = { active: boolean; done: number; total: number; failed: number; finished: boolean };
export const IDLE_UPLOADS: UploadSnapshot = { active: false, done: 0, total: 0, failed: 0, finished: false };

export function createUploadQueue(upload: (slug: string, blob: Blob) => Promise<boolean>) {
  let snap: UploadSnapshot = IDLE_UPLOADS;
  const items: { slug: string; blob: Blob }[] = [];
  let running = false;
  const listeners = new Set<() => void>();
  const set = (next: UploadSnapshot) => { snap = next; listeners.forEach((l) => l()); };

  async function run() {
    running = true;
    while (items.length > 0) {
      const item = items.shift()!;
      let ok = false;
      try { ok = await upload(item.slug, item.blob); } catch { ok = false; }
      set({ ...snap, done: snap.done + 1, failed: snap.failed + (ok ? 0 : 1) });
    }
    running = false;
    set({ ...snap, active: false, finished: true });
  }

  return {
    /** Agrega fotos de un evento (en orden). Si ya hay subidas en curso, se suman; si la cola había terminado, empieza un conteo nuevo. */
    enqueue(slug: string, blobs: readonly Blob[]) {
      if (blobs.length === 0) return;
      const base = snap.finished ? IDLE_UPLOADS : snap;
      for (const blob of blobs) items.push({ slug, blob });
      set({ ...base, active: true, finished: false, total: base.total + blobs.length });
      if (!running) void run();
    },
    /** Oculta el aviso de una cola ya terminada (mientras suben fotos no hace nada). */
    dismiss() { if (!running) set(IDLE_UPLOADS); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snap,
  };
}
