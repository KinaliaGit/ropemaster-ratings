import type { RoundItem } from "@/lib/results-view";
import { groupRoundItems } from "@/lib/round-groups";

export type RoundsState = { status: "loading" } | { status: "error" } | { status: "ok"; items: RoundItem[] };

function Tags({ item }: { item: RoundItem }) {
  return (
    <>
      {item.tags.map((tag) => <span key={tag.label} title={tag.hint} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-muted">{tag.label}</span>)}
      {item.note && <span className="text-xs text-muted">{item.note}</span>}
    </>
  );
}

function Value({ item }: { item: RoundItem }) {
  return <span className="tabular-nums">{item.value}{item.penalty && <span className="text-muted"> ({item.penalty})</span>}</span>;
}

// Detalle de las rondas de un resultado (tiempo, castigo, no time, descalificación, extras, ayudas, desempates y sustituciones).
// Cada ronda va con su nombre y, si el lazador tiró varias veces en ella, sus tiros debajo (Tiro 1, Tiro 2...). Con un solo tiro se ve en una línea.
// Lo usan el historial del perfil y los resultados del evento. `state` indefinido equivale a "cargando".
export function RoundsDetail({ state, labels, onRetry }: { state: RoundsState | undefined; labels: { loadError: string; retry: string; noRounds: string }; onRetry: () => void }) {
  if (!state || state.status === "loading") return <div className="h-4 w-48 animate-pulse rounded bg-sand" aria-hidden />;
  if (state.status === "error") {
    return <p className="text-muted">{labels.loadError}{" "}<button type="button" onClick={onRetry} className="underline">{labels.retry}</button></p>;
  }
  if (state.items.length === 0) return <p className="text-muted">{labels.noRounds}</p>;
  // Leyenda: qué significa cada etiqueta que aparece (en celular no hay tooltip, así que el texto también va a la vista).
  const legend = [...new Map(state.items.flatMap((r) => r.tags).map((tag) => [tag.label, tag])).values()];
  const groups = groupRoundItems(state.items);
  return (
    <>
      <ul className="space-y-2">
        {groups.map((g) => g.items.length === 1 ? (
          <li key={g.items[0].key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="min-w-24 font-medium sm:min-w-44">{g.title}</span>
            <Value item={g.items[0]} />
            <Tags item={g.items[0]} />
          </li>
        ) : (
          <li key={g.key}>
            <p className="font-medium">{g.title}</p>
            <ul className="mt-0.5 space-y-0.5 border-l border-line pl-3">
              {g.items.map((r) => (
                <li key={r.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="min-w-20 text-muted">{r.shot}</span>
                  <Value item={r} />
                  <Tags item={r} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {legend.length > 0 && (
        <dl className="mt-3 space-y-0.5 border-t border-line pt-2 text-xs text-muted">
          {legend.map((tag) => <div key={tag.label}><dt className="inline font-medium">{tag.label}: </dt><dd className="inline">{tag.hint}</dd></div>)}
        </dl>
      )}
    </>
  );
}
