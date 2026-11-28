"use client";
import { useRef } from "react";
import { useFormStatus } from "react-dom";

export type ChangeRoleLabels = { button: string; title: string; body: string; confirm: string; cancel: string };

function Confirm({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} data-testid="change-role-confirm" className="min-h-11 rounded-full bg-ink px-5 text-sm font-medium text-white hover:bg-brand-hot disabled:cursor-wait disabled:opacity-60">{label}</button>;
}

// «Cambiar a Pialador» (o a Cabecero) de una inscripción: el botón abre una ventana que pide confirmar antes de mandar el cambio. La ventana lleva el formulario, así que solo
// al confirmar se llama a la acción. `back` es el slug del evento si el cambio se pide desde su página (la acción vuelve ahí); sin él vuelve a Mi cuenta.
export function ChangeRoleDialog({ action, lang, id, to, back, l, className }: {
  action: (formData: FormData) => void | Promise<void>; lang: string; id: string; to: "header" | "heeler"; back?: string; l: ChangeRoleLabels; className: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `change-role-title-${id}`;
  return (
    <>
      <button type="button" data-testid="change-role-open" className={className} onClick={() => dialog.current?.showModal()}>{l.button}</button>
      <dialog ref={dialog} aria-labelledby={titleId} data-testid="change-role-dialog"
        onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-6 text-ink shadow-[0_12px_32px_-12px_rgba(20,19,17,0.35)] backdrop:bg-black/40">
        <form action={action}>
          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="id" value={id} /><input type="hidden" name="role" value={to} />
          {back && <input type="hidden" name="back" value={back} />}
          <h2 id={titleId} className="text-lg font-semibold">{l.title}</h2>
          <p className="mt-2 text-sm text-muted">{l.body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-full border border-line px-5 text-sm font-medium hover:border-ink">{l.cancel}</button>
            <Confirm label={l.confirm} />
          </div>
        </form>
      </dialog>
    </>
  );
}
