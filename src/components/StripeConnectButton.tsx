"use client";
import { useState } from "react";

type Props = { lang: "es" | "en"; title: string; text: string; btn: string; opening: string };

export function StripeConnectButton({ lang, title, text, btn, opening }: Props) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch("/api/organizador/stripe", { method: "POST", body: JSON.stringify({ lang }) });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url; else setBusy(false);
  }
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-soft p-4">
      <p className="text-sm"><span className="font-semibold">{title}</span> {text}</p>
      <button onClick={go} disabled={busy} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hot disabled:opacity-60">{busy ? opening : btn}</button>
    </div>
  );
}
