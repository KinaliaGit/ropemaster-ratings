"use client";
import { useState } from "react";
import { createSeries, updateSeries } from "@/lib/series-actions";
import { DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/event-time";
import { ArenaFields, type ArenaChoice, type ArenaLabels } from "@/components/ArenaFields";

export type SeriesLabels = {
  name: string; description: string; start: string; end: string; timezone: string; templateTitle: string; templateHint: string; city: string; venue: string; capacity: string; disciplines: string;
  categories: string; categoryName: string; cost: string; costHint: string; addCategory: string; paymentInfo: string; paymentInfoHint: string; create: string; save: string; errors: Record<string, string>;
};
export type SeriesInitial = {
  arenaId?: string | null; slug: string; name: string; description: string; startDate: string; endDate: string; timezone: string;
  city: string; venue: string; capacity: number | null; disciplines: string[]; categories: { name: string; fee: number }[]; paymentInfo: string;
};

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

// Formulario de la serie: sus datos (nombre, fechas) y la configuración que se copia a cada evento nuevo (sede, cupo, categorías, pago).
export function SeriesForm({ lang, labels: l, disciplines, error, initial, arenas, arenaLabels }: { lang: "es" | "en"; labels: SeriesLabels; disciplines: { id: string; label: string }[]; error?: string; initial?: SeriesInitial; arenas: ArenaChoice[]; arenaLabels: ArenaLabels }) {
  const [cats, setCats] = useState<{ name: string; fee: number }[]>(initial?.categories.length ? initial.categories : [{ name: "Libre", fee: 800 }]);
  const tz = initial?.timezone ?? DEFAULT_TIMEZONE;
  return (
    <form action={initial ? updateSeries : createSeries} className="mt-6 space-y-5 card p-6">
      <input type="hidden" name="lang" value={lang} />
      {initial && <input type="hidden" name="slug" value={initial.slug} />}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{l.errors[error] ?? l.errors["1"]}</p>}
      <label className="block text-sm font-medium">{l.name}<input required name="name" minLength={2} maxLength={120} defaultValue={initial?.name} className={input} /></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-medium">{l.start}<input required name="startDate" type="date" defaultValue={initial?.startDate} className={input} /></label>
        <label className="block text-sm font-medium">{l.end}<input required name="endDate" type="date" defaultValue={initial?.endDate} className={input} /></label>
        <label className="block text-sm font-medium">{l.timezone}
          <select name="timezone" defaultValue={tz} className={input}>
            {(TIMEZONES.includes(tz as never) ? TIMEZONES : [tz, ...TIMEZONES]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">{l.description}<textarea name="description" rows={3} maxLength={1000} defaultValue={initial?.description} className={input} /></label>

      <div className="rounded-2xl bg-sand p-4">
        <h2 className="text-base font-semibold">{l.templateTitle}</h2>
        <p className="mt-0.5 text-xs text-muted">{l.templateHint}</p>
        <div className="mt-4"><ArenaFields arenas={arenas} labels={arenaLabels} initial={initial ? { arenaId: initial.arenaId ?? null, venue: initial.venue, city: initial.city } : undefined} /></div>
        <label className="mt-4 block text-sm font-medium sm:w-1/3">{l.capacity}<input required name="capacity" type="number" min={1} defaultValue={initial?.capacity ?? 100} className={input} /></label>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">{l.disciplines}</legend>
          {disciplines.map((d) => <label key={d.id} className="mr-4 text-sm"><input type="checkbox" name="discipline" value={d.id} defaultChecked={initial ? initial.disciplines.includes(d.id) : true} className="mr-1 accent-brand" />{d.label}</label>)}
        </fieldset>
        <fieldset className="mt-4 min-w-0">
          <legend className="text-sm font-medium">{l.categories}</legend>
          <p className="mt-0.5 text-xs text-muted">{l.costHint}</p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_8rem] sm:grid-cols-[minmax(0,1fr)_9.5rem] gap-2 text-xs font-medium text-muted"><span>{l.categoryName}</span><span>{l.cost}</span></div>
          {cats.map((c, i) => (
            <div key={i} className="mt-1.5 grid grid-cols-[minmax(0,1fr)_8rem] sm:grid-cols-[minmax(0,1fr)_9.5rem] gap-2">
              <input name="catName" required value={c.name} aria-label={l.categoryName} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="min-w-0 rounded-xl border border-line bg-white px-4 py-2 outline-none focus:border-ink" />
              <div className="flex items-center rounded-xl border border-line bg-white px-3 focus-within:border-ink">
                <span aria-hidden className="text-muted">$</span>
                <input name="catFee" required type="number" min={0} inputMode="numeric" value={c.fee} aria-label={`${l.cost} (MXN)`} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, fee: Number(e.target.value) } : x))} className="w-full min-w-0 bg-transparent px-1.5 py-2 text-right tabular-nums outline-none" />
                <span aria-hidden className="text-xs font-medium text-muted">MXN</span>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setCats([...cats, { name: "", fee: 0 }])} className="mt-3 min-h-10 text-sm font-medium text-brand-hot">{l.addCategory}</button>
        </fieldset>
        <label className="mt-4 block text-sm font-medium">{l.paymentInfo}
          <textarea name="paymentInfo" rows={3} maxLength={1000} defaultValue={initial?.paymentInfo} className={input} />
          <span className="mt-1 block text-xs font-normal text-muted">{l.paymentInfoHint}</span>
        </label>
      </div>
      <button className="w-full rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{initial ? l.save : l.create}</button>
    </form>
  );
}
