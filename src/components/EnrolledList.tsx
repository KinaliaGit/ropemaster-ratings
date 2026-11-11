"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { EnrolledItem } from "@/lib/enrolled-view";

type Labels = { loadMore: string; loadError: string };

// Inscritos de un evento: la página trae la primera tanda y "Ver más" pide las siguientes (de los primeros a los últimos en inscribirse).
export function EnrolledList({ slug, lang, initial, next: initialNext, labels }: { slug: string; lang: string; initial: EnrolledItem[]; next: string | null; labels: Labels }) {
  const [rows, setRows] = useState(initial);
  const [next, setNext] = useState(initialNext);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (next === null || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/eventos/${encodeURIComponent(slug)}/inscritos?${new URLSearchParams({ lang, cursor: next })}`);
      if (!res.ok) throw new Error("falló");
      const json = (await res.json()) as { rows: EnrolledItem[]; next: string | null };
      setRows((old) => {
        const seen = new Set(old.map((r) => r.id)); // si alguien cambió mientras navegabas, no se repite a nadie
        return [...old, ...json.rows.filter((r) => !seen.has(r.id))];
      });
      setNext(json.next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {rows.map((r) => (
        <Link key={r.id} href={r.href} className="group flex items-center gap-4 border-b border-line py-4 transition hover:bg-sand/60 sm:px-2">
          <Avatar name={r.name} initials={r.initials} url={r.photo} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.name}</p>
            <p className="text-sm text-muted">{r.sub}</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums group-hover:text-brand-hot">{r.rating}</p>
        </Link>
      ))}
      {next !== null && (
        <div className="mt-6 text-center">
          <button onClick={loadMore} disabled={loading} className="rounded-full border border-line bg-white px-6 py-2.5 text-sm font-medium transition hover:border-ink disabled:opacity-60">{labels.loadMore}</button>
          {failed && <p className="mt-3 text-sm text-muted">{labels.loadError}</p>}
        </div>
      )}
    </>
  );
}
