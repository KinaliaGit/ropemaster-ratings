import Link from "next/link";
import type { ArenaOption } from "@/lib/arena";

type Labels = { label: string; all: string; apply: string; clear: string };

// Filtro por arena (KIN-751): un selector con las arenas que hay en la lista que se está viendo (sin duplicados por escritura) y el parámetro
// `?arena=<llave>`. Es un formulario GET normal: funciona sin JavaScript y el enlace se puede compartir.
export function ArenaFilter({ action, options, selected, labels: l, className = "mt-6" }: { action: string; options: ArenaOption[]; selected: string; labels: Labels; className?: string }) {
  if (options.length < 2 && !selected) return null; // con una sola arena no hay nada que elegir
  const base = action.split("#")[0];
  return (
    <form method="get" action={action} role="search" aria-label={l.label} className={`flex flex-wrap items-end gap-3 ${className}`} data-testid="arena-filter">
      <label className="block text-sm font-medium">{l.label}
        <select name="arena" defaultValue={selected} className="mt-1 block min-w-[14rem] rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-ink">
          <option value="">{l.all}</option>
          {options.map((o) => <option key={o.key} value={o.key}>{o.name} ({o.count})</option>)}
        </select>
      </label>
      <button className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">{l.apply}</button>
      {selected && <Link href={base} className="py-2.5 text-sm text-muted hover:text-ink">{l.clear}</Link>}
    </form>
  );
}
