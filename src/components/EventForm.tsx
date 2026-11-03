"use client";
import { useState } from "react";
import { PhotoUploader } from "@/components/PhotoUploader";

type Labels = {
  name: string; date: string; capacity: string; venue: string; city: string; disciplines: string; categories: string; addCategory: string;
  description: string; cover: string; saveDraft: string; publish: string; add: string; hint: string; coverTag: string;
};

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

export function EventForm({ labels: l, disciplines }: { labels: Labels; disciplines: { id: string; label: string }[] }) {
  const [cats, setCats] = useState([{ name: "Libre", fee: 800 }]);
  // TODO: guardar en Supabase (events + event_categories) como borrador o publicado.
  return (
    <form className="mt-6 space-y-5 card p-6" onSubmit={(e) => e.preventDefault()}>
      <label className="block text-sm font-medium">{l.name}<input required className={input} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{l.date}<input required type="date" className={input} /></label>
        <label className="block text-sm font-medium">{l.capacity}<input required type="number" min={1} defaultValue={100} className={input} /></label>
        <label className="block text-sm font-medium">{l.venue}<input required className={input} /></label>
        <label className="block text-sm font-medium">{l.city}<input required className={input} /></label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{l.disciplines}</legend>
        {disciplines.map((d) => <label key={d.id} className="mr-4 text-sm"><input type="checkbox" defaultChecked className="mr-1 accent-brand" />{d.label}</label>)}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">{l.categories}</legend>
        {cats.map((c, i) => (
          <div key={i} className="mt-2 flex gap-2">
            <input value={c.name} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="flex-1 rounded-xl border border-line bg-white px-4 py-2" />
            <input type="number" value={c.fee} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, fee: Number(e.target.value) } : x))} className="w-28 rounded-xl border border-line bg-white px-4 py-2 tabular-nums" />
          </div>
        ))}
        <button type="button" onClick={() => setCats([...cats, { name: "", fee: 0 }])} className="mt-2 text-sm font-medium text-brand-hot">{l.addCategory}</button>
      </fieldset>
      <PhotoUploader labels={{ title: l.cover, add: l.add, hint: l.hint, cover: l.coverTag }} single />
      <label className="block text-sm font-medium">{l.description}<textarea rows={4} className={input} /></label>
      <div className="flex gap-3">
        <button className="flex-1 rounded-full bg-sand py-3 text-sm font-medium">{l.saveDraft}</button>
        <button className="flex-1 rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{l.publish}</button>
      </div>
    </form>
  );
}
