"use client";
import { useState } from "react";
import { addSeriesEvents } from "@/lib/series-actions";

export type SeriesEventsLabels = {
  addTitle: string; addHint: string; name: string; date: string; opens: string; opensHint: string; addRow: string; removeRow: string; createDraft: string; createPublish: string; range: string; defaultName: string;
};
type Row = { name: string; date: string; opens: string };

// Mismo día del mes siguiente (si el mes no llega a ese día, el último), como "YYYY-MM-DD". Sin zonas horarias: solo calendario.
function nextMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "";
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

// Agrega eventos a la serie, uno o varios de golpe. Cada fila: nombre, fecha (dentro de las fechas de la serie) y apertura de inscripciones.
export function SeriesEventsForm({ lang, slug, seriesName, startDate, endDate, existing, labels: l, error }: {
  lang: "es" | "en"; slug: string; seriesName: string; startDate: string; endDate: string; existing: number; labels: SeriesEventsLabels; error?: string;
}) {
  const label = (n: number) => `${seriesName} · ${l.defaultName} ${n}`.slice(0, 120);
  const [rows, setRows] = useState<Row[]>([{ name: label(existing + 1), date: startDate, opens: "" }]);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    const prev = rows[rows.length - 1];
    const next = prev?.date ? nextMonth(prev.date) : startDate;
    setRows([...rows, { name: label(existing + rows.length + 1), date: next > endDate ? endDate : next, opens: "" }]);
  };
  const field = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink";
  return (
    <form action={addSeriesEvents} className="card mt-3 p-5">
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="slug" value={slug} />
      <h3 className="text-base font-semibold">{l.addTitle}</h3>
      <p className="mt-1 text-sm text-muted">{l.addHint}</p>
      <p className="mt-1 text-xs text-muted">{l.opensHint}</p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_9.5rem_12rem_auto] sm:items-end">
            <label className="block text-xs font-medium text-muted">{l.name}<input required name="evName" maxLength={120} value={r.name} onChange={(e) => set(i, { name: e.target.value })} className={`${field} mt-1 text-ink`} /></label>
            <label className="block text-xs font-medium text-muted">{l.date}<input required name="evDate" type="date" min={startDate} max={endDate} value={r.date} onChange={(e) => set(i, { date: e.target.value })} className={`${field} mt-1 text-ink`} /></label>
            <label className="block text-xs font-medium text-muted">{l.opens}<input name="evOpens" type="datetime-local" value={r.opens} onChange={(e) => set(i, { opens: e.target.value })} className={`${field} mt-1 text-ink`} /></label>
            <button type="button" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-full px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-30">{l.removeRow}</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} disabled={rows.length >= 30 - existing} className="mt-3 text-sm font-medium text-brand-hot disabled:opacity-40">{l.addRow}</button>
      <p className="mt-2 text-xs text-muted">{l.range} {startDate} → {endDate}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button name="intent" value="draft" className="flex-1 rounded-full bg-sand py-3 text-sm font-medium transition hover:bg-line">{l.createDraft}</button>
        <button name="intent" value="publish" className="flex-1 rounded-full bg-brand py-3 text-sm font-medium text-white hover:bg-brand-hot">{l.createPublish}</button>
      </div>
    </form>
  );
}
