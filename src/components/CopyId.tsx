"use client";
import { useState } from "react";

type Props = { id: string; label: string; copy: string; copied: string; chip?: boolean };

// ID corto del lazador (RM-0001): se ve en el perfil y se copia con un toque para compartirlo.
// `chip`: una sola etiqueta que se toca para copiar (encabezado de «Mi cuenta»).
export function CopyId({ id, label, copy, copied, chip = false }: Props) {
  const [done, setDone] = useState(false);

  async function onCopy() {
    try { await navigator.clipboard.writeText(id); } catch {
      // Respaldo cuando el portapapeles no está disponible (p. ej. sin HTTPS).
      const el = document.createElement("textarea"); el.value = id; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 2000);
  }

  if (chip) {
    return (
      <button type="button" onClick={onCopy} aria-label={`${copy} ${id}`} title={copy} data-testid="roper-short-id"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sand px-2.5 text-[13px] font-medium sm:px-3 sm:text-sm tabular-nums transition hover:bg-line">
        <span aria-live="polite">{done ? `${copied} ✓` : id}</span>
        {!done && <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>}
      </button>
    );
  }

  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="roper-short-id">
      <span className="text-muted">{label}</span>
      <span className="rounded-full bg-sand px-3 py-1 font-medium tabular-nums">{id}</span>
      <button type="button" onClick={onCopy} aria-label={`${copy} ${id}`} className="rounded-full border border-line px-3 py-2 text-xs font-medium transition hover:border-ink">
        {done ? `${copied} ✓` : copy}
      </button>
    </p>
  );
}
