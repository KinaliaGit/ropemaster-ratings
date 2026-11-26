"use client";
import { useState } from "react";
import { AccountEventCard } from "@/components/AccountEventCard";
import { RoundsDetail, type RoundsState } from "@/components/RoundsDetail";
import type { HistoryItem, RoundItem } from "@/lib/results-view";

type Labels = {
  event: string; date: string; discipline: string; time: string; place: string; verifiedEvent: string;
  loadMore: string; loadError: string; retry: string; viewRounds: string; hideRounds: string; noRounds: string; moreOptions: string;
};

// Historial del lazador: la página trae la primera tanda; "Ver más" pide las siguientes (de lo más reciente a lo más antiguo) y las
// rondas de cada resultado se piden solo al abrirlo. Nada de esto se descarga completo de entrada.
// `notes`: aviso corto por evento (por su enlace), p. ej. «Pago pendiente» en Mi cuenta.
export function ProfileHistory({ roperId, lang, initial, next: initialNext, labels, notes = {} }: { roperId: string; lang: "es" | "en"; initial: HistoryItem[]; next: string | null; labels: Labels; notes?: Record<string, string> }) {
  const [rows, setRows] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Record<string, RoundsState>>({});

  async function loadMore() {
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const params = new URLSearchParams({ lang, cursor: next });
      const res = await fetch(`/api/participantes/${roperId}/resultados?${params}`);
      if (!res.ok) throw new Error("falló");
      const json = (await res.json()) as { rows: HistoryItem[]; next: string | null };
      setRows((old) => {
        const seen = new Set(old.map((r) => r.id));
        return [...old, ...json.rows.filter((r) => !seen.has(r.id))];
      });
      setNext(json.next);
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadRounds(id: string) {
    setRounds((r) => ({ ...r, [id]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/participantes/${roperId}/resultados/${id}/rondas?${new URLSearchParams({ lang })}`);
      if (!res.ok) throw new Error("falló");
      const json = (await res.json()) as { rounds: RoundItem[] };
      setRounds((r) => ({ ...r, [id]: { status: "ok", items: json.rounds } }));
    } catch {
      setRounds((r) => ({ ...r, [id]: { status: "error" } }));
    }
  }

  function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (rounds[id]?.status !== "ok") void loadRounds(id);
  }

  return (
    <>
      {/* KIN-770/780: tarjetas en vez de tabla, igual que los próximos eventos; en celular no hay que deslizar de lado. */}
      <div className="mt-3 space-y-3">
        {rows.map((x) => {
          const state = rounds[x.id];
          const isOpen = open === x.id;
          const note = x.href ? notes[x.href] : undefined;
          return (
            <AccountEventCard key={x.id} date={x.day} lang={lang} name={`${x.event}${x.verified ? " ✓" : ""}`} href={x.href ?? undefined} meta={`${x.discipline} · ${x.date.slice(-4)}`} menuLabel={labels.moreOptions}
              status={
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {x.place !== "–" && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${x.place === "#1" ? "bg-brand text-ink" : "bg-sand"}`} aria-label={`${labels.place} ${x.place}`}>{x.place}</span>}
                  <span className={`text-sm tabular-nums ${x.dq ? "text-muted" : "font-semibold"}`}><span className="sr-only">{labels.time}: </span>{x.result}{x.penalty && <span className="font-normal text-muted"> ({x.penalty})</span>}</span>
                  {note && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">{note}</span>}
                </div>
              }>
              {x.hasRounds && (
                <button type="button" onClick={() => toggle(x.id)} aria-expanded={isOpen} className="mt-1 py-2 text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline">
                  {isOpen ? labels.hideRounds : labels.viewRounds}
                </button>
              )}
              {isOpen && <div className="rounded-xl bg-sand/40 p-3 text-sm"><RoundsDetail state={state} labels={labels} onRetry={() => void loadRounds(x.id)} /></div>}
            </AccountEventCard>
          );
        })}
      </div>
      {next !== null && (
        <div className="mt-6 text-center">
          <button onClick={loadMore} disabled={loadingMore} className="rounded-full border border-line bg-white px-6 py-2.5 text-sm font-medium transition hover:border-ink disabled:opacity-60">{labels.loadMore}</button>
          {moreFailed && <p className="mt-3 text-sm text-muted">{labels.loadError}</p>}
        </div>
      )}
    </>
  );
}
