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
      <input key={`q:${query}`} type="search" name="q" defaultValue={query} maxLength={80} placeholder={l.placeholder} aria-label={l.label} autoComplete="off" enterKeyHint="search" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      {(arenas.length > 1 || arena) && (
        <details key={`a:${arena}`}>
          <summary aria-label={l.arena} title={l.arena} className={`${icon} list-none [&::-webkit-details-marker]:hidden ${arena ? "bg-ink text-white" : "bg-sand hover:bg-line"}`}>
            <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h9M16 6h1M3 14h1M8 14h9" /><circle cx="14" cy="6" r="2" /><circle cx="6" cy="14" r="2" /></svg>
          </summary>
          <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-line bg-white p-3 shadow-[0_12px_32px_-12px_rgba(20,19,17,0.25)] sm:left-auto sm:w-72">
            <label className="block text-sm font-medium">{l.arena}
              <span className="relative mt-1 block">
                {/* La flecha del navegador queda pegada al borde: se oculta y se dibuja una con aire. */}
                <select name="arena" defaultValue={arena} className="min-h-11 w-full appearance-none truncate rounded-xl border border-line bg-white pl-3 pr-10 text-sm font-normal outline-none focus:border-ink">
                  <option value="">{l.allArenas}</option>
                  {arenas.map((o) => <option key={o.key} value={o.key}>{o.name} ({o.count})</option>)}
                </select>
                <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 5 5 5-5" /></svg>
              </span>
            </label>
            <button className="mt-3 min-h-11 w-full rounded-full bg-brand text-sm font-medium text-white hover:bg-brand-hot">{l.apply}</button>
          </div>
        </details>
      )}
    </form>
  );
}
