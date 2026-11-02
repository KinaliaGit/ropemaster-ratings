"use client";
import { useState } from "react";

export function StripeConnectButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch("/api/organizador/stripe", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url; else setBusy(false);
  }
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-soft p-4">
      <p className="text-sm"><span className="font-semibold">Activa tus cobros.</span> Conecta tu cuenta de Stripe para recibir las inscripciones directo en tu banco.</p>
      <button onClick={go} disabled={busy} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream hover:bg-brand-hot disabled:opacity-60">{busy ? "Abriendo…" : "Conectar Stripe"}</button>
    </div>
  );
}
