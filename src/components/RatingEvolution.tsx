import Link from "next/link";
import { getRoperRatingHistory } from "@/lib/data/ropers";
import { ACTIVE_DISCIPLINES } from "@/lib/disciplines";
import { fmtDate, type Lang } from "@/lib/format";
import { fmtRating } from "@/lib/people";
import type { Dict } from "@/dictionaries/es";

// KIN-627: evolución del rating por modalidad (últimos 5 cambios). Estado vacío claro mientras el recálculo esté en pausa.
export async function RatingEvolution({ id, lang, t }: { id: string; lang: Lang; t: Dict }) {
  const changes = (await getRoperRatingHistory(id, 5)).filter((c) => ACTIVE_DISCIPLINES.some((d) => d.id === c.discipline));
  const a = t.account;
  return (
    <section aria-labelledby="evolucion" className="mt-6">
      <h2 id="evolucion" className="text-base font-semibold">{a.ratingEvolution}</h2>
      {changes.length === 0 ? <p className="mt-2 text-sm text-muted">{a.noRatingChanges}</p> : (
        <ul className="card mt-2 divide-y divide-line text-sm">
          {changes.map((c) => {
            const delta = c.previous === null ? null : Math.round((c.rating - c.previous) * 10) / 10;
            return (
              <li key={`${c.discipline}-${c.at}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="min-w-0 break-words">
                  {fmtDate(c.at.slice(0, 10), lang)}
                  {ACTIVE_DISCIPLINES.length > 1 && <span className="text-muted"> · {t.disc[c.discipline as keyof Dict["disc"]].label}</span>}
                  {c.eventName && <span className="text-muted"> · {a.afterEvent} {c.eventSlug ? <Link href={`/${lang}/eventos/${c.eventSlug}`} className="underline hover:text-brand-hot">{c.eventName}</Link> : c.eventName}</span>}
                </span>
                <span className="tabular-nums font-semibold">
                  {fmtRating(c.rating)}
                  {delta !== null && delta !== 0 && <span className={`ml-2 text-xs font-medium ${delta > 0 ? "text-emerald-700" : "text-red-700"}`}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
