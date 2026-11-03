"use client";
import Link from "next/link";
import { useDeferredValue, useState } from "react";

export type ParticipantRow = { id: string; href: string; name: string; initials: string; verified: boolean; sub: string; rating: string; rank: number };

// Quita acentos y mayúsculas para que "sofia" encuentre a "Sofía".
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Lista con búsqueda en vivo: filtra mientras se escribe, sin recargar la página.
export function ParticipantList({ rows, initialQuery = "", labels }: { rows: ParticipantRow[]; initialQuery?: string; labels: { search: string; noResults: string; verified: string } }) {
  const [q, setQ] = useState(initialQuery);
  const deferred = useDeferredValue(q);
  const needle = norm(deferred);
  const list = needle ? rows.filter((r) => norm(r.name).includes(needle)) : rows;

  return (
    <>
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
