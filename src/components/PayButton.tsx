"use client";
import { useState } from "react";

export function PayButton({ eventId }: { eventId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form!;
    const category = new FormData(form).get("cat") as string;
    setBusy(true); setError("");
    const res = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ eventId, category }) });
    const data = await res.json().catch(() => ({}));
    if (data.url) { window.location.href = data.url; return; }
    setError(data.error ?? "No se pudo iniciar el pago"); setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={pay} disabled={busy} className="w-full rounded-full bg-brand py-3 font-semibold text-ink hover:bg-brand-hot disabled:opacity-60">
        {busy ? "Redirigiendo a Stripe…" : "Pagar inscripción"}
      </button>
      {error && <p role="alert" className="text-center text-sm text-red-700">{error}</p>}
    </>
  );
}
