"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { revokeDeviceAction } from "@/lib/sync-actions";

type Labels = { revoke: string; revokeConfirm: string; revokeError: string };

// Revoca un equipo conectado: deja de sincronizar al instante y tendrá que volver a entrar con la contraseña.
export function DeviceRevoke({ id, l }: { id: string; l: Labels }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function revoke() {
    if (!confirm(l.revokeConfirm)) return;
    setBusy(true); setFailed(false);
    const res = await revokeDeviceAction(id).catch(() => ({ error: "x" } as { ok?: true; error?: string }));
    setBusy(false);
    if (res.ok) router.refresh(); else setFailed(true);
  }

  return (
    <div className="shrink-0 text-right">
      <button type="button" onClick={revoke} disabled={busy}
        className="rounded-full border border-line px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-700 disabled:opacity-60">
        {l.revoke}
      </button>
      {failed && <p role="alert" className="mt-1 text-xs text-red-700">{l.revokeError}</p>}
    </div>
  );
}
