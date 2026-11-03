"use client";
import Link from "next/link";
import { useState } from "react";
import { matchesName } from "@/lib/search";

export type ParticipantRow = { id: string; href: string; name: string; initials: string; verified: boolean; sub: string; rating: string; rank: number };
export type RowSet = { id: string; label: string; rows: ParticipantRow[] };

// Lista con búsqueda en vivo y pestañas por modalidad (las pestañas solo aparecen si hay más de una activa).
// Todo ocurre en el navegador, sin recargar ni pedir nada al servidor.
export function ParticipantList({ sets, labels }: { sets: RowSet[]; labels: { search: string; noResults: string; verified: string } }) {
  const [q, setQ] = useState("");
  const [current, setCurrent] = useState(sets[0]?.id);
  const rows = (sets.find((s) => s.id === current) ?? sets[0])?.rows ?? [];
  const list = rows.filter((r) => matchesName(r.name, q));

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
          autoComplete="off" className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-5 text-sm outline-none focus:border-ink"
        />
      </div>
      <div className="mt-6 border-t border-line" aria-live="polite">
        {list.length ? list.map((r) => (
          <Link key={r.id} href={r.href} className="group flex items-center gap-4 border-b border-line py-4 transition hover:bg-sand/60 sm:px-2">
            <span className="w-6 text-sm tabular-nums text-muted">{r.rank}</span>
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-sand text-sm font-semibold">{r.initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name}{r.verified && <span title={labels.verified} className="ml-1 text-brand">✓</span>}</p>
              <p className="text-sm text-muted">{r.sub}</p>
            </div>
            <p className="text-2xl font-semibold tabular-nums group-hover:text-brand-hot">{r.rating}</p>
          </Link>
        )) : <p className="pt-4 text-muted">{labels.noResults} “{q}”.</p>}
      </div>
    </>
  );
}
