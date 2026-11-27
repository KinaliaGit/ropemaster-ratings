"use client";
import { useState } from "react";
import { createEvent, updateEvent } from "@/lib/event-actions";
import { DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/event-time";
import { ArenaFields, type ArenaChoice, type ArenaLabels } from "@/components/ArenaFields";
import { PublishDialog, type VisibilityLabels } from "@/components/PublishDialog";

type Labels = {
  visibility: VisibilityLabels;
  name: string; date: string; capacity: string; venue: string; city: string; disciplines: string; categories: string; categoryName: string; categoryNamePlaceholder: string; cost: string; costHint: string; maxRoperRating: string; maxRoperRatingHint: string; addCategory: string;
  error: string; description: string; saveDraft: string; publish: string; photosLater: string; save: string; errors: Record<string, string>; paymentInfo: string; paymentInfoHint: string; paymentInfoPlaceholder: string;
  opens: string; opensHint: string; closes: string; closesHint: string; timezone: string;
  drawType: string; drawTypeHint: string; drawLocked: string; roundRobin: string; lazadaSorteada: string; shotsPerPackage: string; shotsPerPackageHint: string; maxTeamRating: string; maxTeamRatingHint: string; rounds: string; roundsHint: string;
};
export type EventInitial = { arenaId?: string | null; slug: string; name: string; date: string; capacity: number; venue: string; city: string; description: string; paymentInfo: string; opensAt: string; closesAt: string; timezone: string; disciplines: string[]; maxRoperRating: number | null; drawType: "round_robin" | "lazada_sorteada"; shotsPerPackage: number | null; maxTeamRating: number | null; rounds: number | null; drawLocked: boolean; cats: { id: string; name: string; fee: number }[] };

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

export function EventForm({ lang, labels: l, disciplines, error, initial, arenas, arenaLabels }: { lang: "es" | "en"; labels: Labels; disciplines: { id: string; label: string }[]; error?: string; initial?: EventInitial; arenas: ArenaChoice[]; arenaLabels: ArenaLabels }) {
  const [cats, setCats] = useState<{ id: string; name: string; fee: number }[]>(initial?.cats ?? [{ id: "", name: "Libre", fee: 800 }]);
  const [drawType, setDrawType] = useState<"round_robin" | "lazada_sorteada">(initial?.drawType ?? "round_robin");
  const locked = initial?.drawLocked ?? false; // con inscritos o resultados el tipo y los tiros por paquete ya no cambian (la base lo impone)
  return (
    <form action={initial ? updateEvent : createEvent} className="mt-6 space-y-5 card p-6">
      <input type="hidden" name="lang" value={lang} />
      {initial && <input type="hidden" name="slug" value={initial.slug} />}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{l.errors[error] ?? l.error}</p>}
      <label className="block text-sm font-medium">{l.name}<input required name="name" maxLength={120} defaultValue={initial?.name} className={input} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">{l.date}<input required name="date" type="date" defaultValue={initial?.date} className={input} /></label>
        <label className="block text-sm font-medium">{l.capacity}<input required name="capacity" type="number" min={1} defaultValue={initial?.capacity ?? 100} className={input} /></label>
      </div>
      <ArenaFields arenas={arenas} labels={arenaLabels} initial={initial ? { arenaId: initial.arenaId ?? null, venue: initial.venue, city: initial.city } : undefined} />
      <label className="block text-sm font-medium">{l.maxRoperRating}
        <input name="maxRoperRating" type="number" min={0} max={10} step={0.1} inputMode="decimal" defaultValue={initial?.maxRoperRating ?? ""} className={input} />
        <span className="mt-1 block text-xs font-normal text-muted">{l.maxRoperRatingHint}</span>
      </label>
      <label className="block text-sm font-medium">{l.rounds}
        <input name="rounds" type="number" min={1} max={10} step={1} inputMode="numeric" defaultValue={initial?.rounds ?? ""} className={input} />
        <span className="mt-1 block text-xs font-normal text-muted">{l.roundsHint}</span>
      </label>
      <fieldset>
        <legend className="text-sm font-medium">{l.drawType}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["round_robin", "lazada_sorteada"] as const).map((v) => (
            <label key={v} className={`flex items-center rounded-xl border border-line p-3 text-sm has-checked:border-ink has-checked:bg-sand ${locked ? "opacity-70" : "cursor-pointer"}`}>
              <input type="radio" name={locked ? undefined : "drawType"} value={v} checked={drawType === v} disabled={locked} onChange={() => setDrawType(v)} className="mr-2 accent-brand" />
              {v === "round_robin" ? l.roundRobin : l.lazadaSorteada}
            </label>
          ))}
        </div>
        {locked && <input type="hidden" name="drawType" value={drawType} />}
        <p className="mt-1 text-xs text-muted">{locked ? l.drawLocked : l.drawTypeHint}</p>
        {drawType === "lazada_sorteada" && (
          <label className="mt-3 block text-sm font-medium">{l.shotsPerPackage}
            <input name={locked ? undefined : "shotsPerPackage"} type="number" required min={1} max={999} step={1} inputMode="numeric" defaultValue={initial?.shotsPerPackage ?? ""} readOnly={locked} className={`${input} ${locked ? "opacity-70" : ""}`} />
            {locked && <input type="hidden" name="shotsPerPackage" value={initial?.shotsPerPackage ?? ""} />}
            <span className="mt-1 block text-xs font-normal text-muted">{l.shotsPerPackageHint}</span>
          </label>
        )}
        <label className="mt-3 block text-sm font-medium">{l.maxTeamRating}
          <input name="maxTeamRating" type="number" min={0} max={20} step={0.1} inputMode="decimal" defaultValue={initial?.maxTeamRating ?? ""} className={input} />
          <span className="mt-1 block text-xs font-normal text-muted">{l.maxTeamRatingHint}</span>
        </label>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">{l.disciplines}</legend>
        {disciplines.map((d) => <label key={d.id} className="mr-4 text-sm"><input type="checkbox" name="discipline" value={d.id} defaultChecked={initial ? initial.disciplines.includes(d.id) : true} className="mr-1 accent-brand" />{d.label}</label>)}
      </fieldset>
      <fieldset className="min-w-0">
        <legend className="text-sm font-medium">{l.categories}</legend>
        <p className="mt-0.5 text-xs text-muted">{l.costHint}</p>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_8rem] sm:grid-cols-[minmax(0,1fr)_9.5rem] gap-2 text-xs font-medium text-muted">
          <span>{l.categoryName}</span><span>{l.cost}</span>
        </div>
        {cats.map((c, i) => (
          <div key={i} className="mt-1.5 grid grid-cols-[minmax(0,1fr)_8rem] sm:grid-cols-[minmax(0,1fr)_9.5rem] gap-2">
            <input type="hidden" name="catId" value={c.id} />
            <input name="catName" required value={c.name} placeholder={l.categoryNamePlaceholder} aria-label={l.categoryName}
              onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              className="min-w-0 rounded-xl border border-line bg-white px-4 py-2 outline-none focus:border-ink" />
            <div className="flex items-center rounded-xl border border-line bg-white px-3 focus-within:border-ink">
              <span aria-hidden className="text-muted">$</span>
              <input name="catFee" required type="number" min={0} inputMode="numeric" value={c.fee} aria-label={`${l.cost} (MXN)`}
                onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, fee: Number(e.target.value) } : x))}
                className="w-full min-w-0 bg-transparent px-1.5 py-2 text-right tabular-nums outline-none" />
              <span aria-hidden className="text-xs font-medium text-muted">MXN</span>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setCats([...cats, { id: "", name: "", fee: 0 }])} className="mt-3 min-h-10 text-sm font-medium text-brand-hot">{l.addCategory}</button>
      </fieldset>
      <label className="block text-sm font-medium">{l.paymentInfo}
        <textarea name="paymentInfo" rows={3} maxLength={1000} defaultValue={initial?.paymentInfo} placeholder={l.paymentInfoPlaceholder} className={input} />
        <span className="mt-1 block text-xs font-normal text-muted">{l.paymentInfoHint}</span>
      </label>
      <fieldset>
        <legend className="text-sm font-medium">{l.opens}</legend>
        <p className="mt-0.5 text-xs text-muted">{l.opensHint}</p>
        <input name="opensAt" type="datetime-local" defaultValue={initial?.opensAt} aria-label={l.opens} className={`${input.replace("mt-1 ", "")} mt-2 sm:w-1/2`} />
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">{l.closes}</legend>
        <p className="mt-0.5 text-xs text-muted">{l.closesHint}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <input name="closesAt" type="datetime-local" defaultValue={initial?.closesAt} aria-label={l.closes} className={input.replace("mt-1 ", "")} />
          <select name="timezone" defaultValue={initial?.timezone ?? DEFAULT_TIMEZONE} aria-label={l.timezone} className={input.replace("mt-1 ", "")}>
            {(TIMEZONES.includes(initial?.timezone as never) || !initial ? TIMEZONES : [initial.timezone, ...TIMEZONES]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </fieldset>
      {!initial && <p className="rounded-xl bg-sand p-3 text-sm text-muted">{l.photosLater}</p>}
      <label className="block text-sm font-medium">{l.description}<textarea name="description" rows={4} maxLength={1000} defaultValue={initial?.description} className={input} /></label>
      {initial ? (
        <button className="w-full rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{l.save}</button>
      ) : (
        <div className="flex gap-3">
          <button name="intent" value="draft" className="flex-1 rounded-full bg-sand py-3 text-sm font-medium transition hover:bg-line">{l.saveDraft}</button>
          {/* KIN-769: al publicar se pregunta quién puede ver el evento (público o privado); guardar borrador no pregunta nada */}
          <PublishDialog publishLabel={l.publish} labels={l.visibility} className="flex-1 rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot" />
        </div>
      )}
    </form>
  );
}
