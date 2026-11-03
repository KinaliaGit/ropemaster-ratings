"use client";
import { useState } from "react";

type Props = { eventId: string; lang: "es" | "en"; label: string; busyLabel: string; errors: Record<string, string> };

export function PayButton({ eventId, lang, label, busyLabel, errors }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pay(e: React.MouseEvent<HTMLButtonElement>) {
    const category = new FormData(e.currentTarget.form!).get("cat") as string;
    setBusy(true); setError("");
    const res = await fetch("/api/checkout", { method: "POST", body: JSON.stringify({ eventId, category, lang }) });
    const data = await res.json().catch(() => ({}));
    if (data.url) { window.location.href = data.url; return; }
    setError(errors[data.error] ?? errors.generic); setBusy(false);
  }

  return (
    <>
      <button type="button" onClick={pay} disabled={busy} className="w-full rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hot disabled:opacity-60">{busy ? busyLabel : label}</button>
      {error && <p role="alert" className="text-center text-sm text-red-700">{error}</p>}
    </>
  );
}
