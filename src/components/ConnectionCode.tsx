"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateSyncToken } from "@/lib/sync-actions";

type Labels = { generate: string; regenerate: string; copy: string; copied: string; shownOnce: string; replaceNote: string; error: string };

// Genera el código de conexión y lo muestra una sola vez (después solo queda su huella en el servidor).
export function ConnectionCode({ hasActive, l }: { hasActive: boolean; l: Labels }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (hasActive && !token && !confirm(l.replaceNote)) return;
    setBusy(true); setError(false); setCopied(false);
    const res = await generateSyncToken().catch(() => ({ error: "x" } as { token?: string; error?: string }));
    setBusy(false);
    if (res.token) { setToken(res.token); router.refresh(); } else setError(true);
  }

  async function copy() {
    if (!token) return;
    try { await navigator.clipboard.writeText(token); } catch {
      const el = document.createElement("textarea"); el.value = token; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      {token && (
        <div className="mb-4 rounded-2xl bg-brand-soft p-4">
          <div className="flex flex-wrap gap-2">
            <input readOnly value={token} aria-label={token} onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 font-mono text-sm outline-none focus:border-ink" />
            <button type="button" onClick={copy} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hot">{copied ? `${l.copied} ✓` : l.copy}</button>
          </div>
          <p className="mt-2 text-sm">{l.shownOnce}</p>
        </div>
      )}
      <button type="button" onClick={generate} disabled={busy}
        className={`rounded-full px-5 py-2.5 text-sm font-medium transition disabled:opacity-60 ${hasActive || token ? "border border-line hover:border-ink" : "bg-brand text-white hover:bg-brand-hot"}`}>
        {hasActive || token ? l.regenerate : l.generate}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{l.error}</p>}
    </div>
  );
}
