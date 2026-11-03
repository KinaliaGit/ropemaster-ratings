"use client";
import { useState } from "react";

type Props = { url: string; copy: string; copied: string; whatsappLabel: string; whatsappText: string };

// Enlace para compartir: campo de solo lectura + copiar + compartir por WhatsApp.
export function CopyLink({ url, copy, copied, whatsappLabel, whatsappText }: Props) {
  const [done, setDone] = useState(false);

  async function onCopy() {
    try { await navigator.clipboard.writeText(url); } catch {
      // Respaldo cuando el portapapeles no está disponible (p. ej. sin HTTPS).
      const el = document.createElement("textarea"); el.value = url; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 2000);
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <input readOnly value={url} aria-label={url} onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm tabular-nums outline-none focus:border-ink" />
      <button type="button" onClick={onCopy} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hot">{done ? `${copied} ✓` : copy}</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${whatsappText} ${url}`)}`} target="_blank" rel="noopener noreferrer"
        className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition hover:border-ink">{whatsappLabel}</a>
    </div>
  );
}
