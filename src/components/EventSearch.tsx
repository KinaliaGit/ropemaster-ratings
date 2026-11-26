import type { ArenaOption } from "@/lib/arena";

type Labels = { label: string; placeholder: string; arena: string; allArenas: string; apply: string };

// KIN-768: buscador de la portada en una sola línea; la arena se elige en el botón de filtro. Es un formulario GET con <details>: funciona sin
// JavaScript y el enlace se comparte. `view` conserva la pestaña (próximos o finalizados) al buscar.
export function EventSearch({ action, query, arena, view, arenas, labels: l }: { action: string; query: string; arena: string; view: string; arenas: ArenaOption[]; labels: Labels }) {
  const icon = "grid size-10 shrink-0 cursor-pointer place-items-center rounded-full";
  return (
    <form method="get" action={action} role="search" aria-label={l.label} className="relative mt-4 flex items-center gap-1 rounded-full border border-line bg-white p-1 focus-within:border-ink sm:max-w-lg" data-testid="arena-filter">
      {view && <input type="hidden" name="ver" value={view} />}
      <button aria-label={l.apply} className={`${icon} text-muted hover:bg-sand hover:text-ink`}>
        <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m13.5 13.5 4 4M8.5 15a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" /></svg>
      </button>
      <input key={`q:${query}`} type="search" name="q" defaultValue={query} maxLength={80} placeholder={l.placeholder} aria-label={l.label} autoComplete="off" enterKeyHint="search" className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
      {(arenas.length > 1 || arena) && (
        <details key={`a:${arena}`}>
          <summary aria-label={l.arena} title={l.arena} className={`${icon} list-none [&::-webkit-details-marker]:hidden ${arena ? "bg-ink text-white" : "bg-sand hover:bg-line"}`}>
            <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h9M16 6h1M3 14h1M8 14h9" /><circle cx="14" cy="6" r="2" /><circle cx="6" cy="14" r="2" /></svg>
          </summary>
          <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-line bg-white p-3 shadow-[0_12px_32px_-12px_rgba(20,19,17,0.25)] sm:left-auto sm:w-72">
            {/* Opciones a la vista en lugar del desplegable del navegador, que se veía distinto en cada equipo. Son radios: funcionan sin JavaScript. */}
            <fieldset>
              <legend className="text-sm font-medium">{l.arena}</legend>
              <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto p-0.5">
                {[{ key: "", name: l.allArenas, count: null as number | null }, ...arenas].map((o) => (
                  <label key={`o:${o.key}`} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full bg-sand px-3.5 text-sm font-medium text-muted transition hover:text-ink has-checked:bg-ink has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-brand">
                    <input type="radio" name="arena" value={o.key} defaultChecked={arena === o.key} className="sr-only" />
                    {o.name}{o.count !== null && <span className="text-xs tabular-nums opacity-70">{o.count}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="mt-3 min-h-11 w-full rounded-full bg-brand text-sm font-medium text-white hover:bg-brand-hot">{l.apply}</button>
          </div>
        </details>
      )}
    </form>
  );
}
