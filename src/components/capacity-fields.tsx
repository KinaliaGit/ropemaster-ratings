"use client";
import { useState, type ReactNode } from "react";
import { firstValue, type FormValues } from "@/lib/event-form-state";
import { BASE, Segmented, Switch, fill } from "@/components/form-controls";

// Cupo con interruptor (KIN-775, KIN-798): apagado = sin límite; encendido, se elige «Igual por lado» o «Por lado» y el total se calcula solo (suma).
// Un evento o serie que ya tenía solo un total lo conserva como «Total». Lo comparten el formulario de eventos y el de series.
export type CapacityLabels = {
  capLimit: string; capLimitHint: string; capTotal: string; capEach: string; capHeaders: string; capHeelers: string; capModeTotal: string; capModeEach: string; capModePer: string;
  capSummary: string; chipCap: string; chipCapEach: string; chipCapSides: string; chipCapNone: string;
};
export type CapacityInitial = { capacity: number | null | undefined; headers: number | null | undefined; heelers: number | null | undefined };
type CapMode = "total" | "eq" | "per";

const whole = (s: string) => Math.max(0, parseInt(s, 10) || 0);

/** Estado del cupo: se levanta aparte para que el formulario pueda mostrar su resumen (chip) donde quiera. `values` = lo que devolvió el servidor tras un rechazo. */
export function useCapacity(values: FormValues | undefined, initial: CapacityInitial | undefined, l: CapacityLabels) {
  const v = (name: string, fallback: string | number | null | undefined) => firstValue(values, name, fallback);
  const cap = initial?.capacity ?? 0;
  const h = initial?.headers ?? null;
  const p = initial?.heelers ?? null;
  const hasSides = h !== null || p !== null;
  const legacyTotal = cap > 0 && !hasSides;
  const [on, setOn] = useState(() => (values ? v("capacityMode", "none") !== "none" : cap > 0 || hasSides));
  const [mode, setMode] = useState<CapMode>(() => {
    const m = v("capacityMode", "");
    if (m === "total" || m === "eq" || m === "per") return m;
    if (hasSides) return h === p ? "eq" : "per";
    return legacyTotal ? "total" : "eq";
  });
  const [total, setTotal] = useState(() => v("capacity", cap || ""));
  const [each, setEach] = useState(() => v("capacityEach", hasSides && h === p ? h : ""));
  const [headers, setHeaders] = useState(() => v("capacityHeaders", h));
  const [heelers, setHeelers] = useState(() => v("capacityHeelers", p));
  const sidesReady = headers !== "" && heelers !== "";
  const summary = !on ? "" : mode === "eq" ? (whole(each) > 0 ? fill(l.capSummary, { h: whole(each), p: whole(each), t: 2 * whole(each) }) : "")
    : mode === "per" ? (sidesReady ? fill(l.capSummary, { h: whole(headers), p: whole(heelers), t: whole(headers) + whole(heelers) }) : "") : "";
  const chip = !on ? null : mode === "total" ? (total ? `${l.chipCap} ${total}` : null)
    : mode === "eq" ? (whole(each) > 0 ? fill(l.chipCapEach, { n: whole(each) }) : null) : sidesReady ? fill(l.chipCapSides, { h: whole(headers), p: whole(heelers) }) : null;
  return { on, setOn, mode, setMode, total, setTotal, each, setEach, headers, setHeaders, heelers, setHeelers, legacyTotal, summary, chip };
}
export type CapacityState = ReturnType<typeof useCapacity>;

export function CapacityFields({ state: s, labels: l, invalid, message }: { state: CapacityState; labels: CapacityLabels; invalid: boolean; message?: ReactNode }) {
  const field = `mt-1 ${BASE} ${invalid ? "border-red-600" : "border-line"}`;
  const aria = { "aria-invalid": invalid || undefined, "aria-describedby": invalid ? "err-capacity" : undefined };
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm"><span>{l.capLimit}</span><Switch on={s.on} onChange={s.setOn} label={l.capLimit} /></div>
      {s.on && (
        <div className="mt-2">
          <Segmented name="capacityMode" label={l.capLimit} value={s.mode} onChange={s.setMode}
            options={[...(s.legacyTotal ? [{ value: "total" as const, label: l.capModeTotal }] : []), { value: "eq" as const, label: l.capModeEach }, { value: "per" as const, label: l.capModePer }]} />
          {s.mode === "total" && <label className="mt-2 block text-sm font-medium">{l.capTotal}<input name="capacity" type="number" required min={1} inputMode="numeric" value={s.total} onChange={(e) => s.setTotal(e.target.value)} className={field} {...aria} /></label>}
          {s.mode === "eq" && <label className="mt-2 block text-sm font-medium">{l.capEach}<input name="capacityEach" type="number" required min={1} inputMode="numeric" value={s.each} onChange={(e) => s.setEach(e.target.value)} className={field} {...aria} /></label>}
          {s.mode === "per" && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">{l.capHeaders}<input name="capacityHeaders" type="number" required min={0} inputMode="numeric" value={s.headers} onChange={(e) => s.setHeaders(e.target.value)} className={field} {...aria} /></label>
              <label className="block text-sm font-medium">{l.capHeelers}<input name="capacityHeelers" type="number" required min={0} inputMode="numeric" value={s.heelers} onChange={(e) => s.setHeelers(e.target.value)} className={field} {...aria} /></label>
            </div>
          )}
          {s.summary && <p className="mt-2 text-sm text-muted" data-testid="capacity-summary">{s.summary}</p>}
          <p className="mt-1 text-xs text-muted">{l.capLimitHint}</p>
          {message}
        </div>
      )}
    </div>
  );
}
