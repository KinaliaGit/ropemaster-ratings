"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { RoundsDetail, type RoundsState } from "@/components/RoundsDetail";
import type { ResultItem } from "@/lib/event-results-view";
import type { RoundItem } from "@/lib/results-view";

export type ResultSet = { id: string; label: string; rows: ResultItem[]; next: number | null; total: number };
type Labels = { loadMore: string; loadError: string; retry: string; viewRounds: string; hideRounds: string; noRounds: string; results: string };
type Entry = { rows: ResultItem[]; next: number | null; total: number };

// Resultados de un evento: la página trae la primera tanda de cada modalidad; "Ver más" pide las siguientes (por lugar) y las rondas de
// cada resultado se piden solo al abrirlo. Las pestañas por modalidad solo aparecen si el evento tiene más de una.
export function EventResults({ slug, lang, sets, labels }: { slug: string; lang: string; sets: ResultSet[]; labels: Labels }) {
  const [current, setCurrent] = useState(sets[0]?.id ?? "");
  const [data, setData] = useState<Record<string, Entry>>(() => Object.fromEntries(sets.map((s) => [s.id, { rows: s.rows, next: s.next, total: s.total }])));
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Record<string, RoundsState>>({});

  const entry = data[current];

  async function loadMore() {
    if (!entry || entry.next === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const res = await fetch(`/api/eventos/${encodeURIComponent(slug)}/resultados?${new URLSearchParams({ discipline: current, lang, after: String(entry.next) })}`);
      if (!res.ok) throw new Error("falló");
      const json = (await res.json()) as Entry;
      setData((d) => {
        const old = d[current] ?? entry;
        const seen = new Set(old.rows.map((r) => r.id)); // si un resultado cambió mientras navegabas, no se repite a nadie
        return { ...d, [current]: { rows: [...old.rows, ...json.rows.filter((r) => !seen.has(r.id))], next: json.next, total: json.total } };
      });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadRounds(id: string) {
    setRounds((r) => ({ ...r, [id]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/eventos/${encodeURIComponent(slug)}/resultados/${id}/rondas?${new URLSearchParams({ lang })}`);
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
      {sets.length > 1 && (
        <div className="mt-4 flex gap-2">
          {sets.map((s) => (
            <button key={s.id} onClick={() => { setCurrent(s.id); setOpen(null); }} className={`rounded-full px-4 py-1.5 text-sm font-medium ${s.id === current ? "bg-ink text-white" : "bg-sand text-muted hover:text-ink"}`}>{s.label}</button>
          ))}
        </div>
      )}
      <div className="mt-2" aria-live="polite">
        {entry?.rows.map((r) => (
          <div key={r.id} className="border-b border-line">
            <div className="flex items-center gap-4 py-4 sm:px-2">
              <span className="w-6 text-sm tabular-nums text-muted">{r.place}</span>
              <Avatar name={r.name} initials={r.initials} url={r.photo} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.href ? <Link href={r.href} className="hover:text-brand-hot">{r.name}</Link> : r.name}</p>
                {r.sub && <p className="text-sm text-muted">{r.sub}</p>}
                {r.hasRounds && (
                  <button type="button" onClick={() => toggle(r.id)} aria-expanded={open === r.id} className="mt-0.5 text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
                    {open === r.id ? labels.hideRounds : labels.viewRounds}
                  </button>
                )}
              </div>
              <p className={`text-right text-2xl font-semibold tabular-nums ${r.dq ? "text-base text-muted" : ""}`}>
                {r.result}{r.penalty && <span className="block text-xs font-normal text-muted">{r.penalty}</span>}
              </p>
            </div>
            {open === r.id && (
              <div className="bg-sand/40 px-3 py-3 text-sm">
                <RoundsDetail state={rounds[r.id]} labels={labels} onRetry={() => void loadRounds(r.id)} />
              </div>
            )}
          </div>
        ))}
      </div>
      {entry && entry.next !== null && (
        <div className="mt-6 text-center">
          <button onClick={loadMore} disabled={loadingMore} className="rounded-full border border-line bg-white px-6 py-2.5 text-sm font-medium transition hover:border-ink disabled:opacity-60">{labels.loadMore}</button>
          {moreFailed && <p className="mt-3 text-sm text-muted">{labels.loadError}</p>}
        </div>
      )}
    </>
  );
}
