"use client";
// Controles compartidos por los formularios de eventos y de series (KIN-774, KIN-798): interruptor, opciones en una fila y relleno de textos con marcadores.

// Clase base de los campos; el borde (normal o rojo si el servidor rechazó ese campo) se agrega aparte.
export const BASE = "w-full rounded-xl border bg-white px-4 py-2.5 outline-none focus:border-ink";

// Rellena los marcadores {n}, {h}, {p} y {t} de un texto del diccionario (un componente de servidor no puede pasar funciones a uno de cliente).
export const fill = (text: string, vars: Record<string, number>) => text.replace(/\{(\w)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

// Opciones cerradas en una fila de botones (una sola elegida). Viaja en un campo oculto con el nombre dado.
export function Segmented<T extends string>({ name, label, value, onChange, options }: { name: string; label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-2 flex overflow-hidden rounded-xl border border-line bg-white">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 px-2 text-sm transition-colors ${value === o.value ? "bg-sand font-medium text-ink" : "text-muted hover:bg-sand/60"}`}>{o.label}</button>
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-line"}`}>
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}
