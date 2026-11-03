"use client";
import { useState } from "react";
import { PhotoUploader } from "@/components/PhotoUploader";
import { createEvent } from "@/lib/event-actions";

type Labels = {
  name: string; date: string; capacity: string; venue: string; city: string; disciplines: string; categories: string; categoryName: string; categoryNamePlaceholder: string; cost: string; costHint: string; addCategory: string;
  error: string; description: string; cover: string; saveDraft: string; publish: string; add: string; hint: string; coverTag: string;
};

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

export function EventForm({ lang, labels: l, disciplines, error }: { lang: "es" | "en"; labels: Labels; disciplines: { id: string; label: string }[]; error?: boolean }) {
  const [cats, setCats] = useState([{ name: "Libre", fee: 800 }]);
  // TODO: guardar en Supabase (events + event_categories) como borrador o publicado.
  return (
    <form action={createEvent} className="mt-6 space-y-5 card p-6">
      <input type="hidden" name="lang" value={lang} />
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{l.error}</p>}
      <label className="block text-sm font-medium">{l.name}<input required name="name" maxLength={120} className={input} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{l.date}<input required name="date" type="date" className={input} /></label>
        <label className="block text-sm font-medium">{l.capacity}<input required name="capacity" type="number" min={1} defaultValue={100} className={input} /></label>
        <label className="block text-sm font-medium">{l.venue}<input required name="venue" maxLength={120} className={input} /></label>
        <label className="block text-sm font-medium">{l.city}<input required name="city" maxLength={80} className={input} /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{l.disciplines}</legend>
        {disciplines.map((d) => <label key={d.id} className="mr-4 text-sm"><input type="checkbox" name="discipline" value={d.id} defaultChecked className="mr-1 accent-brand" />{d.label}</label>)}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">{l.categories}</legend>
        <p className="mt-0.5 text-xs text-muted">{l.costHint}</p>
        <div className="mt-3 grid grid-cols-[1fr_9.5rem] gap-2 text-xs font-medium text-muted">
          <span>{l.categoryName}</span><span>{l.cost}</span>
        </div>
        {cats.map((c, i) => (
          <div key={i} className="mt-1.5 grid grid-cols-[1fr_9.5rem] gap-2">
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
        <button type="button" onClick={() => setCats([...cats, { name: "", fee: 0 }])} className="mt-3 text-sm font-medium text-brand-hot">{l.addCategory}</button>
      </fieldset>
      <PhotoUploader labels={{ title: l.cover, add: l.add, hint: l.hint, cover: l.coverTag }} single />
      <label className="block text-sm font-medium">{l.description}<textarea name="description" rows={4} maxLength={1000} className={input} /></label>
      <div className="flex gap-3">
        <button name="intent" value="draft" className="flex-1 rounded-full bg-sand py-3 text-sm font-medium transition hover:bg-line">{l.saveDraft}</button>
        <button name="intent" value="publish" className="flex-1 rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{l.publish}</button>
      </div>
    </form>
  );
}
