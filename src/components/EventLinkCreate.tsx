"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEventLinkAction, type CreateLinkResult } from "@/lib/event-link-actions";

export type EventLinkLabels = {
  event: string; label: string; labelPlaceholder: string; permissions: string; scopeRead: string; scopeResults: string; scopePayments: string;
  create: string; creating: string; created: string; code: string; copy: string; copied: string; codeHint: string; another: string;
  errors: Record<Extract<CreateLinkResult, { ok: false }>["error"], string>;
};

const input = "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal outline-none focus:border-ink";

// Crea el enlace de un evento publicado: el organizador elige para quién es y qué puede hacer. El código se muestra una sola vez.
export function EventLinkCreate({ events, l }: { events: { id: string; name: string }[]; l: EventLinkLabels }) {
  const router = useRouter();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [results, setResults] = useState(true);
  const [payments, setPayments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const scopes = ["event:read", ...(results ? ["results:write"] : []), ...(payments ? ["payments:write"] : [])];
    const res = await createEventLinkAction(eventId, label, scopes).catch((): CreateLinkResult => ({ ok: false, error: "failed" }));
    setBusy(false);
    if (res.ok) { setInvite(res.invite); setLabel(""); router.refresh(); } else setError(l.errors[res.error] ?? l.errors.failed);
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
      <div className="mt-4 rounded-xl border border-line bg-sand p-4" role="status">
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
    <form onSubmit={submit} className="mt-4 grid gap-4">
      <label className="text-sm font-medium">{l.event}
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} required className={input}>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">{l.label}
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoComplete="off" placeholder={l.labelPlaceholder} className={input} />
      </label>
      <fieldset className="text-sm">
        <legend className="font-medium">{l.permissions}</legend>
        <label className="mt-2 flex items-center gap-2 text-muted"><input type="checkbox" checked disabled /> {l.scopeRead}</label>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={results} onChange={(e) => setResults(e.target.checked)} /> {l.scopeResults}</label>
        <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={payments} onChange={(e) => setPayments(e.target.checked)} /> {l.scopePayments}</label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div>
        <button disabled={busy || !eventId} className="min-h-11 rounded-full bg-ink px-6 text-sm font-medium text-white transition hover:bg-brand-hot disabled:opacity-60">{busy ? l.creating : l.create}</button>
      </div>
    </form>
  );
}
