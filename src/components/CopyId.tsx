"use client";
import { useState } from "react";

type Props = { id: string; label: string; copy: string; copied: string };

// ID corto del lazador (RM-0001): se ve en el perfil y se copia con un toque para compartirlo.
export function CopyId({ id, label, copy, copied }: Props) {
  const [done, setDone] = useState(false);

  async function onCopy() {
    try { await navigator.clipboard.writeText(id); } catch {
      // Respaldo cuando el portapapeles no está disponible (p. ej. sin HTTPS).
      const el = document.createElement("textarea"); el.value = id; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 2000);
  }

  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="roper-short-id">
      <span className="text-muted">{label}</span>
      <span className="rounded-full bg-sand px-3 py-1 font-medium tabular-nums">{id}</span>
      <button type="button" onClick={onCopy} aria-label={`${copy} ${id}`} className="rounded-full border border-line px-3 py-1 text-xs font-medium transition hover:border-ink">
        {done ? `${copied} ✓` : copy}
      </button>
    </p>
  );
}
