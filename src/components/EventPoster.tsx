"use client";
import { useEffect, useRef, useState } from "react";
import { toLogoPng } from "@/lib/resize-image";

export type PosterLabels = {
  title: string; hint: string; generate: string; dialogTitle: string; logoQuestion: string; withLogo: string; withoutLogo: string;
  logoPick: string; logoChange: string; logoRemove: string; logoAlt: string; logoHint: string; logoErrors: { invalid: string; tooBig: string };
  make: string; making: string; download: string; close: string; previewAlt: string; errors: Record<string, string>;
};

const LOGO_SIDE = 256; // lado largo del logo que se manda (se dibuja a unos 76 px en el póster)
const LOGO_MAX_BYTES = 200 * 1024; // el servidor acepta hasta 400 KB
const PICK_MAX_BYTES = 5 * 1024 * 1024; // lo más grande que se deja elegir (se reduce antes de mandarlo)
const PICK_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Póster del evento (KIN-767): botón + ventana del panel del organizador. Pregunta si lleva su logo, pide el PNG al servidor (que lo arma al momento y no guarda nada) y
// permite descargarlo o compartirlo. El logo se recuerda SOLO en este navegador (localStorage, ya reducido: pesa unos KB); en nuestros servidores no se guarda.
export function EventPoster({ eventSlug, lang, organizerId, l }: { eventSlug: string; lang: string; organizerId: string; l: PosterLabels }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const storeKey = `rm-poster-logo:${organizerId}`;
  const [useLogo, setUseLogo] = useState(false);
  const [logo, setLogo] = useState<{ blob: Blob; url: string } | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string } | null>(null);

  // Si este navegador ya recuerda un logo, la ventana arranca con él.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storeKey);
      if (saved?.startsWith("data:image/png;base64,")) {
        fetch(saved).then((r) => r.blob()).then((blob) => { setLogo({ blob, url: saved }); setUseLogo(true); }).catch(() => {});
      }
    } catch { /* sin almacenamiento: simplemente no se recuerda */ }
  }, [storeKey]);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  function open() { setError(null); setLogoError(null); dialog.current?.showModal(); }
  function close() { dialog.current?.close(); }
  function reset() { setResult(null); setError(null); }

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    if (!PICK_TYPES.includes(file.type)) return setLogoError(l.logoErrors.invalid);
    if (file.size > PICK_MAX_BYTES) return setLogoError(l.logoErrors.tooBig);
    try {
      const blob = await toLogoPng(file, LOGO_SIDE, LOGO_MAX_BYTES);
      const url = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
      setLogo({ blob, url });
      setUseLogo(true);
      try { window.localStorage.setItem(storeKey, url); } catch { /* sin espacio: se usa esta vez y ya */ }
    } catch { setLogoError(l.logoErrors.invalid); }
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeLogo() {
    setLogo(null); setUseLogo(false); setLogoError(null);
    try { window.localStorage.removeItem(storeKey); } catch { /* nada que borrar */ }
  }

  async function generate() {
    setBusy(true); setError(null);
    try {
      const body = new FormData();
      body.set("lang", lang);
      if (useLogo && logo) body.set("logo", new File([logo.blob], "logo.png", { type: "image/png" }));
      const res = await fetch(`/api/organizador/eventos/${encodeURIComponent(eventSlug)}/poster`, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const key = data.error === "not_found" ? "unauthorized" : data.error === "not_published" ? "notPublished" : data.error ?? "failed";
        setError(l.errors[key] ?? l.errors.failed);
        return;
      }
      const blob = await res.blob();
      setResult({ blob, url: URL.createObjectURL(blob) });
    } catch { setError(l.errors.failed); } finally { setBusy(false); }
  }

  const needsLogo = useLogo && !logo;
  const pill = "rounded-full px-5 py-2.5 text-sm font-medium transition";

  return (
    <>
      <button type="button" onClick={open} data-testid="poster-open" className={`${pill} bg-ink text-white hover:bg-brand-hot`}>{l.generate}</button>
      <dialog ref={dialog} aria-labelledby="poster-title" data-testid="poster-dialog" onClose={reset}
        onClick={(e) => { if (e.target === dialog.current) close(); }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-white p-6 text-ink shadow-[0_12px_32px_-12px_rgba(20,19,17,0.35)] backdrop:bg-black/40">
        <h2 id="poster-title" className="text-lg font-semibold">{l.dialogTitle}</h2>

        {result ? (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de un blob local, no una imagen del sitio */}
            <img src={result.url} alt={l.previewAlt} data-testid="poster-preview" className="mx-auto aspect-[4/5] w-full max-w-sm rounded-xl border border-line object-contain" />
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={close} data-testid="poster-close" className={`${pill} text-muted hover:text-ink`}>{l.close}</button>
              <a href={result.url} download={`poster-${eventSlug}.png`} data-testid="poster-download" className={`${pill} bg-ink text-white hover:bg-brand-hot`}>{l.download}</a>
            </div>
          </div>
        ) : (
          <>
            <fieldset className="mt-4 space-y-2">
              <legend className="text-sm font-medium">{l.logoQuestion}</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-2.5 text-sm has-[:checked]:border-ink">
                <input type="radio" name="poster-logo" checked={useLogo} onChange={() => setUseLogo(true)} data-testid="poster-with-logo" /> {l.withLogo}
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-2.5 text-sm has-[:checked]:border-ink">
                <input type="radio" name="poster-logo" checked={!useLogo} onChange={() => setUseLogo(false)} data-testid="poster-without-logo" /> {l.withoutLogo}
              </label>
            </fieldset>
            {useLogo && (
              <div className="mt-3 rounded-xl bg-sand p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {logo && (/* eslint-disable-next-line @next/next/no-img-element -- logo local recordado en este navegador */
                    <img src={logo.url} alt={l.logoAlt} className="size-14 rounded-lg bg-white object-contain p-1" />)}
                  <button type="button" onClick={() => fileInput.current?.click()} className={`${pill} border border-line bg-white hover:border-ink`}>{logo ? l.logoChange : l.logoPick}</button>
                  {logo && <button type="button" onClick={removeLogo} className="text-sm text-muted underline hover:text-ink">{l.logoRemove}</button>}
                </div>
                <input ref={fileInput} type="file" accept={PICK_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label={l.logoPick} data-testid="poster-logo-input" onChange={(e) => pickLogo(e.target.files?.[0])} />
                <p className="mt-3 text-xs text-muted">{l.logoHint}</p>
                {logoError && <p role="alert" className="mt-2 text-sm text-red-800">{logoError}</p>}
              </div>
            )}
            {error && <p role="alert" data-testid="poster-error" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={close} className={`${pill} border border-line hover:border-ink`}>{l.close}</button>
              <button type="button" onClick={generate} disabled={busy || needsLogo} data-testid="poster-make" className={`${pill} bg-ink text-white hover:bg-brand-hot disabled:cursor-not-allowed disabled:opacity-40`}>{busy ? l.making : l.make}</button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
