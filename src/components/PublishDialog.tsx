"use client";
import { useRef } from "react";

export type VisibilityLabels = { title: string; publicLabel: string; publicHint: string; privateLabel: string; privateHint: string; cancel: string; confirm: string };

// «Publicar» del formulario de crear evento (KIN-769): antes de publicar pregunta quién puede ver el evento (público o privado). El botón «Publicar» primero comprueba que el
// formulario esté completo y entonces abre la ventana; el botón de confirmar de la ventana es el que envía el formulario con `intent=publish` y la visibilidad elegida, así que
// el evento nace publicado YA con esa visibilidad (no hay un momento en que sea público por error). La ventana vive dentro del formulario: sus opciones viajan con él.
// Un borrador no pregunta nada; el servidor ignora la visibilidad si no se publica (visibilityForCreate).
export function PublishDialog({ publishLabel, labels, className }: { publishLabel: string; labels: VisibilityLabels; className: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={className} onClick={(e) => {
        const form = e.currentTarget.form;
        if (form && !form.reportValidity()) return; // que avise de lo que falta antes de preguntar
        dialog.current?.showModal();
      }}>{publishLabel}</button>
      <dialog ref={dialog} aria-labelledby="publish-visibility-title" data-testid="publish-dialog"
        onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-6 text-ink shadow-[0_12px_32px_-12px_rgba(20,19,17,0.35)] backdrop:bg-black/40">
        <h2 id="publish-visibility-title" className="text-lg font-semibold">{labels.title}</h2>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">{labels.title}</legend>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-checked:border-ink has-checked:bg-sand">
            <input type="radio" name="visibility" value="publico" defaultChecked className="mt-1 accent-brand" />
            <span><span className="block text-sm font-medium">{labels.publicLabel}</span><span className="block text-xs text-muted">{labels.publicHint}</span></span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-checked:border-ink has-checked:bg-sand">
            <input type="radio" name="visibility" value="privado" className="mt-1 accent-brand" />
            <span><span className="block text-sm font-medium">{labels.privateLabel}</span><span className="block text-xs text-muted">{labels.privateHint}</span></span>
          </label>
        </fieldset>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => dialog.current?.close()} className="flex-1 rounded-full bg-sand py-3 text-sm font-medium transition hover:bg-line">{labels.cancel}</button>
          <button name="intent" value="publish" className="flex-1 rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{labels.confirm}</button>
        </div>
      </dialog>
    </>
  );
}
