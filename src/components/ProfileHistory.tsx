"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { RoundsDetail, type RoundsState } from "@/components/RoundsDetail";
import type { HistoryItem, RoundItem } from "@/lib/results-view";

type Labels = {
  event: string; date: string; discipline: string; time: string; place: string; verifiedEvent: string;
  loadMore: string; loadError: string; retry: string; viewRounds: string; hideRounds: string; noRounds: string;
};

// Historial del lazador: la página trae la primera tanda; "Ver más" pide las siguientes (de lo más reciente a lo más antiguo) y las
// rondas de cada resultado se piden solo al abrirlo. Nada de esto se descarga completo de entrada.
export function ProfileHistory({ roperId, lang, initial, next: initialNext, labels }: { roperId: string; lang: string; initial: HistoryItem[]; next: string | null; labels: Labels }) {
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
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand label"><tr><th className="p-3">{labels.event}</th><th>{labels.date}</th><th>{labels.discipline}</th><th>{labels.time}</th><th>{labels.place}</th></tr></thead>
          <tbody>
            {rows.map((x) => {
              const state = rounds[x.id];
              const isOpen = open === x.id;
              return (
                <Fragment key={x.id}>
                  <tr className="border-t border-line">
                    <td className="p-3 font-medium">
                      {x.href ? <Link href={x.href} className="hover:text-brand-hot">{x.event}</Link> : x.event}
                      {x.verified && <span className="ml-1 text-brand" title={labels.verifiedEvent}>✓</span>}
                      {x.hasRounds && (
                        <button type="button" onClick={() => toggle(x.id)} aria-expanded={isOpen} className="mt-1 block text-xs font-normal text-muted underline-offset-2 hover:text-ink hover:underline">
                          {isOpen ? labels.hideRounds : labels.viewRounds}
                        </button>
                      )}
                    </td>
                    <td className="tabular-nums">{x.date}</td>
                    <td>{x.discipline}</td>
                    <td className="tabular-nums">{x.result}{x.penalty && <span className="text-muted"> ({x.penalty})</span>}</td>
                    <td className="tabular-nums">{x.place}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-sand/40">
                      <td colSpan={5} className="px-3 py-3">
                        <RoundsDetail state={state} labels={labels} onRetry={() => void loadRounds(x.id)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
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
