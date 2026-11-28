"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEventLinkAction, type CreateLinkResult } from "@/lib/event-link-actions";

export type EventLinkLabels = {
  defaultLabel: string; create: string; creating: string; created: string; code: string; copy: string; copied: string; codeHint: string; another: string;
  errors: Record<Extract<CreateLinkResult, { ok: false }>["error"], string>;
};

// Genera el enlace de la app local de UN evento (siempre con los tres permisos, sin preguntar nada). El código se muestra una sola vez.
export function EventLinkCreate({ eventId, l }: { eventId: string; l: EventLinkLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true); setError(null);
    const res = await createEventLinkAction(eventId, l.defaultLabel).catch((): CreateLinkResult => ({ ok: false, error: "failed" }));
    setBusy(false);
    if (res.ok) { setInvite(res.invite); router.refresh(); } else setError(l.errors[res.error] ?? l.errors.failed);
  }

  async function copy() {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite); } catch {
      const el = document.createElement("textarea"); el.value = invite; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  if (invite) {
    return (
      <div className="mt-3 rounded-xl border border-line bg-sand p-4" role="status" data-testid="event-link-created">
        <p className="text-sm font-medium">{l.created}</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted">{l.code}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <input readOnly value={invite} aria-label={l.code} onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm tabular-nums outline-none focus:border-ink" />
          <button type="button" onClick={copy} className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hot">{copied ? `${l.copied} ✓` : l.copy}</button>
        </div>
        <p className="mt-2 text-sm text-muted">{l.codeHint}</p>
        <button type="button" onClick={() => { setInvite(null); setCopied(false); }} className="mt-3 text-sm font-medium underline">{l.another}</button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={generate} disabled={busy} data-testid="event-link-generate"
        className="min-h-11 rounded-full bg-ink px-6 text-sm font-medium text-white transition hover:bg-brand-hot disabled:opacity-60">{busy ? l.creating : l.create}</button>
    </div>
  );
}
