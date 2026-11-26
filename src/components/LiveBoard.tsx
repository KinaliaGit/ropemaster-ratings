"use client";
import { useEffect, useState } from "react";
import { findTeams, progressPct, type LiveSnapshot, type LiveTeam } from "@/lib/live";
import { fmtTime, initials } from "@/lib/people";
import { matchesName } from "@/lib/search";
import type { Dict } from "@/dictionaries/es";

type Labels = Dict["live"];
const fill = (text: string, values: Record<string, number>) => text.replace(/\{(\w+)\}/g, (_, k) => String(values[k]));
const names = (t: LiveTeam) => `${t.header} + ${t.heeler}`;

// KIN-558: vista pública de un evento en vivo (boceto «Podio»). Solo presenta lo que recibe; de dónde salen los datos lo decide quien la usa.
export function LiveBoard({ data, labels: l }: { data: LiveSnapshot; labels: Labels }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const pct = progressPct(data.done, data.total);
  const found = findTeams(data, query, matchesName);
  const [first, second, third] = data.standings;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700"><span aria-hidden className="size-2 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" />{l.live}</span>
        <Ago since={data.updatedAt} labels={l} />
      </div>
      <h1 className="mt-1.5 break-words text-2xl font-semibold sm:text-3xl">{data.name}</h1>
      <p className="text-sm text-muted">{data.venue}</p>

      <div className="mt-4 grid items-start gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <section className="card flex items-center gap-4 p-4">
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={l.progress} className="grid size-16 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--orange) 0 ${pct}%, var(--sand) ${pct}% 100%)` }}>
              <span className="grid size-12 place-items-center rounded-full bg-white text-sm font-semibold tabular-nums">{pct}%</span>
            </div>
            <div>
              <p className="font-semibold">{fill(l.round, { a: data.round, b: data.rounds })}</p>
              <p className="text-sm text-muted">{fill(l.teams, { a: data.done, b: data.total, c: data.total - data.done })}</p>
            </div>
          </section>

          <section className="card p-4" aria-live="polite">
            {data.current ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-hot">{fill(l.onDeck, { a: data.current.n })}</p>
                <div className="mt-3 flex items-center gap-3">
                  <div aria-hidden className="flex shrink-0">
                    <span className="grid size-12 place-items-center rounded-full border-2 border-white bg-sand text-sm font-semibold">{initials(data.current.header)}</span>
                    <span className="-ml-2 grid size-12 place-items-center rounded-full border-2 border-white bg-brand-soft text-sm font-semibold text-brand-hot">{initials(data.current.heeler)}</span>
                  </div>
                  <p className="min-w-0 flex-1 break-words font-semibold leading-snug">{data.current.header}<br />{data.current.heeler}</p>
                  {data.current.totalMs !== null && (
                    <p className="shrink-0 text-right"><span className="block text-lg font-semibold tabular-nums">{fmtTime(data.current.totalMs)}</span><span className="text-xs text-muted">{l.accumulated}</span></p>
                  )}
                </div>
                {data.pending.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{l.next}</p>
                    <ol className="mt-2 space-y-2">
                      {data.pending.slice(0, 2).map((t) => <li key={t.n} className="flex items-center gap-3 text-sm"><Turn n={t.n} label={l.turn} /><span className="min-w-0 flex-1 break-words">{names(t)}</span></li>)}
                    </ol>
                  </div>
                )}
              </>
            ) : <p className="py-2 text-center text-muted">{data.done >= data.total ? l.roundOver : l.waiting}</p>}
          </section>
        </div>

        <div className="space-y-3">
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">{l.standings}</h2>
              {data.standings.length > 3 && <button onClick={() => setAll((v) => !v)} aria-expanded={all} className="min-h-10 text-sm font-medium text-muted hover:text-ink">{all ? l.showLess : l.showAll} ›</button>}
            </div>
            {!first ? <p className="rounded-2xl bg-sand p-6 text-center text-muted">{l.noTimes}</p> : (
              <ol className="mt-2 grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2">
                <Step team={second} place={2} />
                <Step team={first} place={1} />
                <Step team={third} place={3} />
              </ol>
            )}
            {all && data.standings.length > 3 && (
              <ol start={4} className="card mt-2 divide-y divide-line px-4">
                {data.standings.slice(3).map((t, i) => (
                  <li key={t.n} className="flex items-center gap-3 py-2.5 text-sm"><span className="w-6 shrink-0 tabular-nums text-muted">{i + 4}</span><span className="min-w-0 flex-1 break-words">{names(t)}</span><span className="font-semibold tabular-nums">{fmtTime(t.totalMs)}</span></li>
                ))}
              </ol>
            )}
          </section>

          <div>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={l.search} aria-label={l.search} autoComplete="off" maxLength={80} className="min-h-11 w-full rounded-full border border-transparent bg-sand px-4 text-sm outline-none focus:border-ink" />
            {query.trim() && (
              <ul className="card mt-2 divide-y divide-line px-4" aria-live="polite">
                {found.length === 0 && <li className="py-3 text-sm text-muted">{l.noMatch}</li>}
                {found.length > 1 && <li className="py-3 text-sm font-semibold">{l.turns} <span className="tabular-nums">{found.map((m) => m.team.n).join(" · ")}</span></li>}
                {found.map((m) => (
                  <li key={m.team.n} className="flex items-center gap-3 py-2.5 text-sm">
                    <Turn n={m.team.n} label={l.turn} />
                    <span className={`min-w-0 flex-1 break-words ${m.state === "placed" ? "text-muted" : ""}`}>{names(m.team)}</span>
                    <span className={`shrink-0 text-right font-medium tabular-nums ${m.state === "placed" ? "text-muted" : "text-brand-hot"}`}>
                      {m.state === "current" ? l.nowShort : m.state === "pending" ? (m.ahead === 1 ? l.isNext : fill(l.ahead, { a: m.ahead })) : `#${m.place} · ${fmtTime(m.team.totalMs)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// El número de turno, que es como los lazadores se ubican.
function Turn({ n, label }: { n: number; label: string }) {
  return <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sand text-sm font-semibold tabular-nums" aria-label={fill(label, { a: n })}>{n}</span>;
}

// Un escalón del podio. El primero va en medio y más alto; el orden visual no cambia el que se lee (cada uno dice su lugar).
function Step({ team, place }: { team: LiveTeam | undefined; place: number }) {
  if (!team) return <li aria-hidden />;
  return (
    <li value={place} className={`list-none rounded-2xl border px-2 text-center ${place === 1 ? "border-brand/30 bg-brand-soft py-5" : "border-line bg-white py-3"}`}>
      <span className="block text-sm font-semibold text-brand-hot">{place}</span>
      <span className="mt-1 block break-words text-xs leading-snug">{team.header}<br />{team.heeler}</span>
      <span className="mt-1.5 block text-base font-semibold tabular-nums">{fmtTime(team.totalMs)}</span>
    </li>
  );
}

// «hace 8 s»: cuenta en el navegador desde la última actualización; en el servidor se deja vacío para no descuadrar la hidratación.
function Ago({ since, labels: l }: { since: string; labels: Labels }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.round((Date.now() - Date.parse(since)) / 1000)));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [since]);
  return <span className="text-xs tabular-nums text-muted">{seconds === null ? "" : fill(l.updated, { a: seconds })}</span>;
}
