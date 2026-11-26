"use client";
import { useRef, useState } from "react";

export type DeleteLabels = {
  button: string; title: string; typePrompt: string; word: string; reasonLabel: string; reasonPlaceholder: string; minChars: string; notify: string | null;
  cancel: string; confirm: string;
};

// KIN-660: confirmación de un borrado destructivo. Resume qué se va a borrar, pide el MOTIVO cuando hay inscritos (mínimo 10 caracteres) y deja el
// botón final apagado hasta que se escriba la palabra (borrar / delete, sin importar mayúsculas). El servidor y la base lo vuelven a validar.
export function DeleteConfirmDialog({ action, lang, fields, id, summary, needReason, l }: {
  action: (formData: FormData) => void | Promise<void>; lang: string; fields: Record<string, string>; id: string; summary: [string, string][]; needReason: boolean; l: DeleteLabels;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const wordOk = typed.trim().toLowerCase() === l.word.toLowerCase();
  const reasonOk = !needReason || reason.trim().length >= 10;
  const close = () => { ref.current?.close(); setTyped(""); };
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800">{l.button}</button>
      <dialog ref={ref} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-labelledby={`del-${id}`} className="m-auto w-[min(92vw,30rem)] rounded-2xl p-0 backdrop:bg-black/40" onClose={() => setTyped("")}>
        <form action={action} className="p-6">
          <h3 id={`del-${id}`} className="text-lg font-semibold text-red-800">{l.title}</h3>
          <input type="hidden" name="lang" value={lang} />
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <dl className="mt-3 space-y-1 text-sm">
            {summary.map(([a, b]) => <div key={a} className="flex gap-2"><dt className="text-muted">{a}</dt><dd className="min-w-0 break-words font-medium">{b}</dd></div>)}
          </dl>
          {l.notify && <p role="note" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{l.notify}</p>}
          {needReason && (
            <>
              <label className="mt-4 block text-sm font-medium" htmlFor={`dr-${id}`}>{l.reasonLabel}</label>
              <textarea id={`dr-${id}`} name="reason" required minLength={10} maxLength={500} rows={3} value={reason} placeholder={l.reasonPlaceholder} onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
              {!reasonOk && <p className="mt-1 text-xs text-muted">{l.minChars}</p>}
            </>
          )}
          <label className="mt-4 block text-sm font-medium" htmlFor={`dw-${id}`}>{l.typePrompt}</label>
          <input id={`dw-${id}`} name="confirmWord" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false}
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-red-700" />
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} className="rounded-full bg-sand px-4 min-h-11 py-2 text-sm sm:min-h-0 font-medium hover:bg-line">{l.cancel}</button>
            <button disabled={!wordOk || !reasonOk} className="rounded-full bg-red-700 px-4 min-h-11 py-2 text-sm sm:min-h-0 font-medium text-white hover:bg-red-800 disabled:opacity-40">{l.confirm}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
