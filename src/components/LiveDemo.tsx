"use client";
import { useEffect, useState } from "react";
import { LiveBoard } from "@/components/LiveBoard";
import { demoSnapshot } from "@/lib/live-demo";
import type { Dict } from "@/dictionaries/es";

const STEP_MS = 5000;

// Simula que la ronda avanza (un equipo cada 5 s) para ver cómo se actualiza la pantalla. Datos inventados.
export function LiveDemo({ name, venue, labels }: { name: string; venue: string; labels: Dict["live"] }) {
  const [state, setState] = useState(() => ({ done: 24, now: 0 }));
  useEffect(() => {
    const first = setTimeout(() => setState((s) => ({ ...s, now: Date.now() })), 0);
    const timer = setInterval(() => setState((s) => ({ done: s.done >= demoSnapshot(0, 0).total ? 0 : s.done + 1, now: Date.now() })), STEP_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  if (!state.now) return null;
  return (
    <>
      <p role="note" className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-medium text-amber-900">{labels.demo}</p>
      <LiveBoard data={{ ...demoSnapshot(state.done, state.now), name, venue }} labels={labels} />
    </>
  );
}
