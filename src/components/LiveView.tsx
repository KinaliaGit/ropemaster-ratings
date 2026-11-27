"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveBoard } from "@/components/LiveBoard";
import { LiveDemo } from "@/components/LiveDemo";
import type { LiveSnapshot } from "@/lib/live";
import type { Dict } from "@/dictionaries/es";

const POLL_MS = 5_000; // sondeo cada 5 s (la decisión 7 de KIN-782 decía 10-15 s; se acortó para que se sienta en vivo; con ETag, lo que no cambió es un 304)

// KIN-787: la pantalla en vivo con datos reales. Pregunta cada 5 s a `GET /api/eventos/<id>/en-vivo` mientras la pestaña está a la vista (y al volver a ella).
// Usa el ETag para que lo que no cambió cueste un 304. Si la conexión cae conserva la última foto, avisa y sigue intentando sola.
// `demo` (solo en desarrollo): mientras el evento no tenga datos reales se ve la demostración de Anita.
export function LiveView({ eventId, initial, demo, labels }: { eventId: string; initial: LiveSnapshot | null; demo: { name: string; venue: string } | null; labels: Dict["live"] }) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(initial);
  const [offline, setOffline] = useState(false);
  const etag = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/eventos/${eventId}/en-vivo`, { headers: etag.current ? { "If-None-Match": etag.current } : {}, cache: "no-store" });
      if (res.status === 304 || res.status === 404) return setOffline(false);
      if (!res.ok) return setOffline(true);
      etag.current = res.headers.get("ETag");
      setSnapshot((await res.json()) as LiveSnapshot);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [eventId]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  return (
    <>
      {offline && <p role="status" className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm font-medium text-amber-900">{labels.offline}</p>}
      {snapshot ? <LiveBoard data={snapshot} labels={labels} /> : demo ? <LiveDemo name={demo.name} venue={demo.venue} labels={labels} /> : <p role="note" className="card p-6 text-center text-muted">{labels.noData}</p>}
    </>
  );
}
