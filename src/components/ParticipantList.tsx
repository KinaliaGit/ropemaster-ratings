"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";

export type ParticipantRow = { id: string; href: string; name: string; initials: string; photo: string | null; sub: string; rating: string; rank: number };
// `next`: último lugar de la página recibida si hay más (se manda como `after`); null si ya está todo.
export type RowSet = { id: string; label: string; rows: ParticipantRow[]; next: number | null };
type Entry = { rows: ParticipantRow[]; next: number | null };
type Labels = { search: string; noResults: string; empty: string; loadMore: string; loadError: string; retry: string };

const keyOf = (discipline: string, q: string) => `${discipline}\n${q}`;

// Lista paginada con búsqueda y pestañas por modalidad (las pestañas solo aparecen si hay más de una activa).
// La página trae la primera tanda de cada modalidad; "Ver más" y la búsqueda piden al servidor (/api/ranking), que ordena y numera todo el
// ranking: nunca se descarga completo. Cada resultado conserva su lugar real, también al buscar.
export function ParticipantList({ sets, lang, labels }: { sets: RowSet[]; lang: string; labels: Labels }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState(""); // la búsqueda ya "asentada" (espera un instante a que termines de escribir)
  const [current, setCurrent] = useState(sets[0]?.id ?? "");
  const [data, setData] = useState<Record<string, Entry>>(() => Object.fromEntries(sets.map((s) => [keyOf(s.id, ""), { rows: s.rows, next: s.next }])));
  const [failed, setFailed] = useState<string | null>(null); // clave cuya carga falló (se reintenta con el botón)
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const key = keyOf(current, query);
  const entry = data[key];
  const missing = entry === undefined;

  useEffect(() => {
    if (!missing || failed === key) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ discipline: current, lang, q: query });
    fetch(`/api/ranking?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("falló"))))
      .then((json: Entry) => setData((d) => ({ ...d, [key]: { rows: json.rows, next: json.next } })))
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setFailed(key); });
    return () => controller.abort();
  }, [missing, failed, key, current, lang, query]);

  async function loadMore() {
    if (!entry || entry.next === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const params = new URLSearchParams({ discipline: current, lang, q: query, after: String(entry.next) });
      const res = await fetch(`/api/ranking?${params}`);
      if (!res.ok) throw new Error("falló");
      const json = (await res.json()) as Entry;
      setData((d) => {
        const old = d[key] ?? entry;
        const seen = new Set(old.rows.map((r) => r.id)); // si un rating cambió mientras navegabas, no se repite a nadie
        return { ...d, [key]: { rows: [...old.rows, ...json.rows.filter((r) => !seen.has(r.id))], next: json.next } };
      });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = entry?.rows ?? [];
  const loading = missing && failed !== key;

  return (
    <>
      {sets.length > 1 && (
        <div className="mt-6 flex gap-2">
          {sets.map((s) => (
            <button key={s.id} onClick={() => setCurrent(s.id)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${s.id === current ? "bg-ink text-white" : "bg-sand text-muted hover:text-ink"}`}>{s.label}</button>
          ))}
        </div>
      )}
      <div className="relative mt-6 max-w-lg">
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="m13.5 13.5 4 4M8.5 15a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" /></svg>
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} aria-label={labels.search}
          autoComplete="off" maxLength={60} className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-5 text-sm outline-none focus:border-ink"
        />
      </div>
      <div className="mt-6 border-t border-line" aria-live="polite" aria-busy={loading}>
        {loading && (
          <div className="animate-pulse" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 border-b border-line py-4 sm:px-2">
                <span className="h-4 w-6 rounded bg-sand" />
                <span className="size-10 rounded-full bg-sand" />
                <div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-sand" /><div className="h-3 w-28 rounded bg-sand/70" /></div>
                <span className="h-7 w-10 rounded bg-sand" />
              </div>
            ))}
          </div>
        )}
        {failed === key && missing && (
          <p className="pt-4 text-muted">{labels.loadError}{" "}<button onClick={() => setFailed(null)} className="underline">{labels.retry}</button></p>
        )}
        {!missing && (rows.length ? rows.map((r) => (
          <Link key={r.id} href={r.href} className="group flex items-center gap-4 border-b border-line py-4 transition hover:bg-sand/60 sm:px-2">
            <span className="w-6 text-sm tabular-nums text-muted">{r.rank}</span>
            <Avatar name={r.name} initials={r.initials} url={r.photo} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name}</p>
              <p className="text-sm text-muted">{r.sub}</p>
            </div>
            <p className="text-2xl font-semibold tabular-nums group-hover:text-brand-hot">{r.rating}</p>
          </Link>
        )) : <p className="pt-4 text-muted">{query ? `${labels.noResults} “${query}”.` : labels.empty}</p>)}
      </div>
      {entry?.next != null && (
        <div className="mt-6 text-center">
          <button onClick={loadMore} disabled={loadingMore} className="rounded-full border border-line bg-white px-6 py-2.5 text-sm font-medium transition hover:border-ink disabled:opacity-60">
            {labels.loadMore}
          </button>
          {moreFailed && <p className="mt-3 text-sm text-muted">{labels.loadError}</p>}
        </div>
      )}
    </>
  );
}
