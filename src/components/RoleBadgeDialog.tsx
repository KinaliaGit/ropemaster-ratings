"use client";
import { useRef } from "react";
import { RoleFields, type RoleFieldLabels } from "@/components/RoleFields";
import type { RoleChoice } from "@/lib/roles";

export type RoleBadgeLabels = { fields: RoleFieldLabels; title: string; save: string; cancel: string; choose: string; edit: string };

// KIN-654: el rol guardado se ve como badge junto al nombre y es el punto de edición: al pulsarlo abre el diálogo con las
// preguntas de siempre. Sin rol, el badge invita a elegirlo. Guardar usa la misma acción de siempre (setMyRole).
export function RoleBadgeDialog({ action, lang, initial, text, l }: {
  action: (formData: FormData) => void | Promise<void>; lang: string; initial: RoleChoice | null; text: string; l: RoleBadgeLabels;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-haspopup="dialog" aria-label={`${text}. ${l.edit}`} title={l.edit}
        className={`inline-flex max-w-full items-center rounded-full px-3 py-1 text-sm font-medium ${initial ? "bg-sand text-ink hover:bg-line" : "bg-brand-soft text-brand-hot hover:bg-line"}`}>
        <span className="break-words text-left">{initial ? text : l.choose}</span>
      </button>
      <dialog ref={ref} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-labelledby="rol-dialogo" className="m-auto w-[min(92vw,28rem)] rounded-2xl p-0 backdrop:bg-black/40">
        <form action={action} onSubmit={() => ref.current?.close()} className="p-6">
          <h3 id="rol-dialogo" className="text-lg font-semibold">{l.title}</h3>
          <input type="hidden" name="lang" value={lang} />
          <div className="mt-4 space-y-4"><RoleFields labels={l.fields} initial={initial} /></div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-full bg-sand px-4 min-h-11 py-2 text-sm sm:min-h-0 font-medium hover:bg-line">{l.cancel}</button>
            <button className="rounded-full bg-ink px-5 min-h-11 py-2 text-sm sm:min-h-0 font-medium text-white hover:bg-brand-hot">{l.save}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
