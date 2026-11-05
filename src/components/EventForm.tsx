"use client";
import { useState } from "react";
import { createEvent, updateEvent } from "@/lib/event-actions";

type Labels = {
  name: string; date: string; capacity: string; venue: string; city: string; disciplines: string; categories: string; categoryName: string; categoryNamePlaceholder: string; cost: string; costHint: string; addCategory: string;
  error: string; description: string; saveDraft: string; publish: string; photosLater: string; save: string; errors: Record<string, string>; paymentInfo: string; paymentInfoHint: string; paymentInfoPlaceholder: string;
};
export type EventInitial = { slug: string; name: string; date: string; capacity: number; venue: string; city: string; description: string; paymentInfo: string; disciplines: string[]; cats: { id: string; name: string; fee: number }[] };

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

export function EventForm({ lang, labels: l, disciplines, error, initial }: { lang: "es" | "en"; labels: Labels; disciplines: { id: string; label: string }[]; error?: string; initial?: EventInitial }) {
  const [cats, setCats] = useState<{ id: string; name: string; fee: number }[]>(initial?.cats ?? [{ id: "", name: "Libre", fee: 800 }]);
  return (
    <form action={initial ? updateEvent : createEvent} className="mt-6 space-y-5 card p-6">
      <input type="hidden" name="lang" value={lang} />
      {initial && <input type="hidden" name="slug" value={initial.slug} />}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{l.errors[error] ?? l.error}</p>}
      <label className="block text-sm font-medium">{l.name}<input required name="name" maxLength={120} defaultValue={initial?.name} className={input} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{l.date}<input required name="date" type="date" defaultValue={initial?.date} className={input} /></label>
        <label className="block text-sm font-medium">{l.capacity}<input required name="capacity" type="number" min={1} defaultValue={initial?.capacity ?? 100} className={input} /></label>
        <label className="block text-sm font-medium">{l.venue}<input required name="venue" maxLength={120} defaultValue={initial?.venue} className={input} /></label>
        <label className="block text-sm font-medium">{l.city}<input required name="city" maxLength={80} defaultValue={initial?.city} className={input} /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{l.disciplines}</legend>
        {disciplines.map((d) => <label key={d.id} className="mr-4 text-sm"><input type="checkbox" name="discipline" value={d.id} defaultChecked={initial ? initial.disciplines.includes(d.id) : true} className="mr-1 accent-brand" />{d.label}</label>)}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">{l.categories}</legend>
        <p className="mt-0.5 text-xs text-muted">{l.costHint}</p>
        <div className="mt-3 grid grid-cols-[1fr_9.5rem] gap-2 text-xs font-medium text-muted">
          <span>{l.categoryName}</span><span>{l.cost}</span>
        </div>
        {cats.map((c, i) => (
          <div key={i} className="mt-1.5 grid grid-cols-[1fr_9.5rem] gap-2">
            <input type="hidden" name="catId" value={c.id} />
            <input name="catName" required value={c.name} placeholder={l.categoryNamePlaceholder} aria-label={l.categoryName}
              onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              className="rounded-xl border border-line bg-white px-4 py-2 outline-none focus:border-ink" />
            <div className="flex items-center rounded-xl border border-line bg-white px-3 focus-within:border-ink">
              <span aria-hidden className="text-muted">$</span>
              <input name="catFee" required type="number" min={0} inputMode="numeric" value={c.fee} aria-label={`${l.cost} (MXN)`}
                onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, fee: Number(e.target.value) } : x))}
                className="w-full min-w-0 bg-transparent px-1.5 py-2 text-right tabular-nums outline-none" />
              <span aria-hidden className="text-xs font-medium text-muted">MXN</span>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setCats([...cats, { id: "", name: "", fee: 0 }])} className="mt-3 text-sm font-medium text-brand-hot">{l.addCategory}</button>
      </fieldset>
      <label className="block text-sm font-medium">{l.paymentInfo}
        <textarea name="paymentInfo" rows={3} maxLength={1000} defaultValue={initial?.paymentInfo} placeholder={l.paymentInfoPlaceholder} className={input} />
        <span className="mt-1 block text-xs font-normal text-muted">{l.paymentInfoHint}</span>
      </label>
      {!initial && <p className="rounded-xl bg-sand p-3 text-sm text-muted">{l.photosLater}</p>}
      <label className="block text-sm font-medium">{l.description}<textarea name="description" rows={4} maxLength={1000} defaultValue={initial?.description} className={input} /></label>
      {initial ? (
        <button className="w-full rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{l.save}</button>
      ) : (
        <div className="flex gap-3">
          <button name="intent" value="draft" className="flex-1 rounded-full bg-sand py-3 text-sm font-medium transition hover:bg-line">{l.saveDraft}</button>
          <button name="intent" value="publish" className="flex-1 rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{l.publish}</button>
        </div>
      )}
    </form>
  );
}
