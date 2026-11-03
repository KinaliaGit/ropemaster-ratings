"use client";
import Link from "next/link";
import { useState } from "react";
import { matchesName } from "@/lib/search";

export type OrgRow = { id: string; href: string; name: string; phone: string; ratings: string[]; events: number; wins: number; profile: string };
type Labels = { search: string; noResults: string; name: string; phone: string; ratingHeads: string[]; events: string; wins: string; profile: string };

// Directorio para organizadores con búsqueda en vivo (mismo comportamiento que el público; también busca por celular).
export function OrgParticipantsTable({ rows, l }: { rows: OrgRow[]; l: Labels }) {
  const [q, setQ] = useState("");
  const digits = q.replace(/\D/g, "");
  const list = rows.filter((r) => matchesName(r.name, q) || (digits.length >= 3 && r.phone.replace(/\D/g, "").includes(digits)));
  return (
    <>
      <div className="relative mt-6 max-w-lg">
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="m13.5 13.5 4 4M8.5 15a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={l.search} aria-label={l.search} autoComplete="off"
          className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-5 text-sm outline-none focus:border-ink" />
      </div>
      <div className="card mt-4 overflow-x-auto" aria-live="polite">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand label"><tr><th className="p-3">{l.name}</th><th>{l.phone}</th>{l.ratingHeads.map((h) => <th key={h}>{h}</th>)}<th>{l.events}</th><th>{l.wins}</th><th>{l.profile}</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3 font-medium"><Link href={r.href} className="hover:text-brand-hot">{r.name}</Link></td>
                <td className="tabular-nums">{r.phone}</td>
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
