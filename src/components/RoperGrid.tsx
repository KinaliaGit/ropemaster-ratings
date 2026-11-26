"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { fmtRating, initials, publicAvatarUrl } from "@/lib/people";
import type { DirectoryPage } from "@/lib/roper-directory";

type Labels = {
  search: string; noResults: string; loadMore: string; loadError: string; retry: string; rating: string; position: string; all: string; headers: string; heelers: string;
  header: string; heeler: string; both: string;
};
const query = (discipline: string, q: string, role: string) => new URLSearchParams({ discipline, q, role });

// KIN-768: directorio en tarjetas, por nombre. El número es un hándicap para clasificar, no un lugar: se filtra por posición.
// La página trae la primera tanda; filtros, búsqueda y «Ver más» piden al servidor (/api/directorio).
export function RoperGrid({ discipline, lang, initial, labels: l }: { discipline: string; lang: string; initial: DirectoryPage | null; labels: Labels }) {
  const [q, setQ] = useState("");
  const [settled, setSettled] = useState(""); // la búsqueda cuando ya dejaste de escribir
  const [role, setRole] = useState("");
  const [data, setData] = useState<Record<string, DirectoryPage>>(() => (initial ? { [query(discipline, "", "").toString()]: initial } : {}));
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSettled(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const key = query(discipline, settled, role).toString();
  const entry = data[key];
  const missing = entry === undefined;

  useEffect(() => {
    if (!missing || failed === key) return;
    const controller = new AbortController();
    fetch(`/api/directorio?${key}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("falló"))))
      .then((json: DirectoryPage) => setData((d) => ({ ...d, [key]: json })))
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setFailed(key); });
    return () => controller.abort();
  }, [missing, failed, key]);

  async function loadMore() {
    if (!entry?.next || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/directorio?${key}&after=${entry.next}`);
      if (!res.ok) throw new Error("falló");
      const json = (await res.json()) as DirectoryPage;
      setData((d) => {
        const old = d[key] ?? entry;
        const seen = new Set(old.rows.map((r) => r.id));
        return { ...d, [key]: { rows: [...old.rows, ...json.rows.filter((r) => !seen.has(r.id))], next: json.next } };
      });
      setFailed(null);
    } catch {
      setFailed(key);
    } finally {
      setLoadingMore(false);
    }
  }

  const roleName = (r: string | null) => (r === "header" ? l.header : r === "heeler" ? l.heeler : r === "both" ? l.both : "");
  const chip = (on: boolean) => `min-h-10 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition sm:px-4 sm:text-sm ${on ? "bg-ink text-white" : "bg-sand text-muted hover:text-ink"}`;

  return (
    <>
      <div className="relative mt-4">
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"><path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="m13.5 13.5 4 4M8.5 15a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" /></svg>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setFailed(null); }} placeholder={l.search} aria-label={l.search} autoComplete="off" maxLength={60}
          className="min-h-12 w-full rounded-full border border-line bg-white pl-10 pr-5 text-sm outline-none focus:border-ink" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={l.position}>
        {([["", l.all], ["header", l.headers], ["heeler", l.heelers]] as const).map(([v, label]) => (
          <button key={v || "all"} type="button" aria-pressed={role === v} onClick={() => { setRole(v); setFailed(null); }} className={chip(role === v)}>{label}</button>
        ))}
      </div>

      <div className="mt-4" aria-live="polite" aria-busy={missing && failed !== key}>
        {missing && failed !== key && (
          <div className="grid animate-pulse grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6" aria-hidden>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card h-36 bg-sand/60" />)}</div>
        )}
        {missing && failed === key && <p className="text-muted">{l.loadError}{" "}<button type="button" onClick={() => setFailed(null)} className="underline">{l.retry}</button></p>}
        {entry && entry.rows.length === 0 && <p className="rounded-2xl bg-sand p-6 text-center text-muted">{l.noResults}</p>}
        {entry && entry.rows.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6">
            {entry.rows.map((r) => (
              <li key={r.id} className="min-w-0">
                <Link href={`/${lang}/participantes/${r.id}`} className="card card-link group flex h-full flex-col items-center px-1.5 pb-3 pt-4 text-center">
                  <span className="relative">
                    <Avatar name={r.name} initials={initials(r.name)} url={publicAvatarUrl(r.avatarPath)} className="size-14 text-base sm:size-16" />
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border-2 border-white bg-brand px-2 text-xs font-semibold tabular-nums text-ink"><span className="sr-only">{l.rating} </span>{fmtRating(r.rating)}</span>
                  </span>
                  <span className="mt-4 line-clamp-2 w-full break-words text-[13px] font-medium leading-tight group-hover:text-brand-hot sm:text-sm">{r.name}</span>
                  {roleName(r.role) && <span className="mt-1 text-xs text-muted">{roleName(r.role)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {entry?.next && (
        <div className="mt-6 text-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="min-h-11 rounded-full border border-line bg-white px-6 text-sm font-medium transition hover:border-ink disabled:opacity-60">{l.loadMore}</button>
          {failed === key && <p className="mt-3 text-sm text-muted">{l.loadError}</p>}
        </div>
      )}
    </>
  );
}
