import type { RoundItem } from "@/lib/results-view";

export type RoundsState = { status: "loading" } | { status: "error" } | { status: "ok"; items: RoundItem[] };

// Detalle de las rondas de un resultado (tiempo, castigo, no time, descalificación, extras, ayudas, desempates y sustituciones).
// Lo usan el historial del perfil y los resultados del evento. `state` indefinido equivale a "cargando".
export function RoundsDetail({ state, labels, onRetry }: { state: RoundsState | undefined; labels: { loadError: string; retry: string; noRounds: string }; onRetry: () => void }) {
  if (!state || state.status === "loading") return <div className="h-4 w-48 animate-pulse rounded bg-sand" aria-hidden />;
  if (state.status === "error") {
    return <p className="text-muted">{labels.loadError}{" "}<button type="button" onClick={onRetry} className="underline">{labels.retry}</button></p>;
  }
  if (state.items.length === 0) return <p className="text-muted">{labels.noRounds}</p>;
  // Leyenda: qué significa cada etiqueta que aparece (en celular no hay tooltip, así que el texto también va a la vista).
  const legend = [...new Map(state.items.flatMap((r) => r.tags).map((tag) => [tag.label, tag])).values()];
  return (
    <>
      <ul className="space-y-1.5">
        {state.items.map((r) => (
          <li key={r.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="min-w-44 font-medium">{r.title}</span>
            <span className="tabular-nums">{r.value}{r.penalty && <span className="text-muted"> ({r.penalty})</span>}</span>
            {r.tags.map((tag) => <span key={tag.label} title={tag.hint} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-muted">{tag.label}</span>)}
            {r.note && <span className="text-xs text-muted">{r.note}</span>}
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
