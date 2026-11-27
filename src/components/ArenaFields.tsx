"use client";
import { useState } from "react";

export type ArenaChoice = { id: string; name: string; city: string };
export type ArenaLabels = { pick: string; newArena: string; name: string; city: string; cityMissing: string };

const base = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

// Dónde es el evento (KIN-751): se elige una arena del catálogo del organizador o se escribe una nueva (nombre y ciudad). Siempre manda `venue` y `city`
// (la arena elegida los trae puestos) y, si hay catálogo, `arenaId`; el servidor decide qué arena es y la base deja el evento con su nombre y ciudad.
export function ArenaFields({ arenas, labels: l, initial, invalid = false, describedBy }: { arenas: ArenaChoice[]; labels: ArenaLabels; initial?: { arenaId: string | null; venue: string; city: string }; invalid?: boolean; describedBy?: string }) {
  const [sel, setSel] = useState(initial?.arenaId && arenas.some((a) => a.id === initial.arenaId) ? initial.arenaId : "");
  const chosen = arenas.find((a) => a.id === sel);
  // KIN-774: el formulario de eventos marca la arena con borde rojo cuando el servidor la rechaza.
  const input = invalid ? base.replace("border-line", "border-red-600") : base;
  const a11y = { "aria-invalid": invalid || undefined, "aria-describedby": invalid ? describedBy : undefined };
  return (
    <div className="space-y-4" data-testid="arena-fields">
      {arenas.length > 0 && (
        <label className="block text-sm font-medium">{l.pick}
          <select name="arenaId" value={sel} onChange={(e) => setSel(e.target.value)} className={input} {...a11y}>
            <option value="">{l.newArena}</option>
            {arenas.map((a) => <option key={a.id} value={a.id}>{a.name}{a.city ? ` · ${a.city}` : ""}</option>)}
          </select>
        </label>
      )}
      {chosen ? (
        <>
          <input type="hidden" name="venue" value={chosen.name} />
          {chosen.city ? <input type="hidden" name="city" value={chosen.city} /> : (
            <label className="block text-sm font-medium">{l.city}
              <input required name="city" maxLength={80} defaultValue={initial?.city} className={input} {...a11y} />
              <span className="mt-1 block text-xs font-normal text-muted">{l.cityMissing}</span>
            </label>
          )}
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">{l.name}<input required name="venue" maxLength={120} defaultValue={initial?.venue} className={input} {...a11y} /></label>
          <label className="block text-sm font-medium">{l.city}<input required name="city" maxLength={80} defaultValue={initial?.city} className={input} {...a11y} /></label>
        </div>
      )}
    </div>
  );
}
