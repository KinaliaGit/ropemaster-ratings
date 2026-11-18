"use client";
import { useRef, useState } from "react";

export type RemoveLabels = {
  button: string; title: string; person: string; payment: string; reasonLabel: string; reasonPlaceholder: string; presets: string; other: string;
  presetList: string[]; refundWarning: string; cancel: string; confirm: string; minChars: string;
};

// "Sacar del evento": diálogo de confirmación con el nombre, la categoría, el estado de pago y el motivo (obligatorio).
// La página ya sabe quién puede verlo; la base vuelve a validar todo al enviar.
export function RemoveRegistrationDialog({ action, lang, slug, id, name, category, paymentLabel, paid, l }: {
  action: (formData: FormData) => void | Promise<void>; lang: string; slug: string; id: string; name: string; category: string; paymentLabel: string; paid: boolean; l: RemoveLabels;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-red-700 hover:border-red-700">{l.button}</button>
      <dialog ref={ref} aria-labelledby={`rm-${id}`} className="m-auto w-[min(92vw,28rem)] rounded-2xl p-0 backdrop:bg-black/40">
        <form action={action} className="p-6">
          <h3 id={`rm-${id}`} className="text-lg font-semibold">{l.title}</h3>
          <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="id" value={id} />
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2"><dt className="text-muted">{l.person}</dt><dd className="font-medium">{name}{category ? ` · ${category}` : ""}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">{l.payment}</dt><dd className="font-medium">{paymentLabel}</dd></div>
          </dl>
          {paid && <p role="note" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{l.refundWarning}</p>}
          <label className="mt-4 block text-sm font-medium" htmlFor={`rs-${id}`}>{l.presets}</label>
          <select id={`rs-${id}`} value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value) setReason(e.target.value); }} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm">
            <option value="">{l.other}</option>
            {l.presetList.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="mt-3 block text-sm font-medium" htmlFor={`rt-${id}`}>{l.reasonLabel}</label>
          <textarea id={`rt-${id}`} name="reason" required minLength={3} maxLength={500} rows={3} value={reason} placeholder={l.reasonPlaceholder}
            onChange={(e) => { setReason(e.target.value); if (preset && e.target.value !== preset) setPreset(""); }} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink" />
          {!ok && <p className="mt-1 text-xs text-muted">{l.minChars}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-full bg-sand px-4 py-2 text-sm font-medium hover:bg-line">{l.cancel}</button>
            <button disabled={!ok} className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-40">{l.confirm}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
