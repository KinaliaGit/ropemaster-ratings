"use client";
import Link from "next/link";
import { useState } from "react";
import { matchesName } from "@/lib/search";

export type OrgRow = { id: string; href: string; name: string; email: string; ratings: string[]; events: number; wins: number; profile: string };
type Labels = { search: string; noResults: string; name: string; email: string; ratingHeads: string[]; events: string; wins: string; profile: string };

// Directorio para organizadores con búsqueda en vivo (mismo comportamiento que el público; también busca por correo).
export function OrgParticipantsTable({ rows, l }: { rows: OrgRow[]; l: Labels }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => matchesName(r.name, q) || (needle.length >= 3 && r.email.toLowerCase().includes(needle)));
  return (
    <>
      <div className="relative mt-6 max-w-lg">
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="m13.5 13.5 4 4M8.5 15a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={l.search} aria-label={l.search} autoComplete="off"
          className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-5 text-sm outline-none focus:border-ink" />
      </div>
      {/* Celular: tarjetas con lo esencial (nombre, correo, ratings, estado del perfil). */}
      <div className="mt-4 space-y-3 sm:hidden" aria-live="polite">
        {list.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={r.href} className="font-semibold hover:text-brand-hot">{r.name}</Link>
              <span className="shrink-0 rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-muted">{r.profile}</span>
            </div>
            <p className="mt-0.5 break-all text-sm text-muted">{r.email}</p>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {r.ratings.map((v, i) => <div key={i}><dt className="label inline">{l.ratingHeads[i]} </dt><dd className="inline font-medium tabular-nums">{v}</dd></div>)}
              <div><dt className="label inline">{l.events} </dt><dd className="inline font-medium tabular-nums">{r.events}</dd></div>
              <div><dt className="label inline">{l.wins} </dt><dd className="inline font-medium tabular-nums">{r.wins}</dd></div>
            </dl>
          </div>
        ))}
        {list.length === 0 && <p className="rounded-2xl bg-sand p-4 text-muted">{l.noResults} “{q}”.</p>}
      </div>
      <div className="card mt-4 hidden overflow-x-auto sm:block" aria-live="polite">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand label"><tr><th className="p-3">{l.name}</th><th>{l.email}</th>{l.ratingHeads.map((h) => <th key={h}>{h}</th>)}<th>{l.events}</th><th>{l.wins}</th><th>{l.profile}</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3 font-medium"><Link href={r.href} className="hover:text-brand-hot">{r.name}</Link></td>
                <td>{r.email}</td>
                {r.ratings.map((v, i) => <td key={i} className="tabular-nums">{v}</td>)}
                <td className="tabular-nums">{r.events}</td><td className="tabular-nums">{r.wins}</td><td>{r.profile}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5 + l.ratingHeads.length} className="p-4 text-muted">{l.noResults} “{q}”.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
