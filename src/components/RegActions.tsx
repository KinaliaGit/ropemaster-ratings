"use client";
import { useState } from "react";

// Fila de acciones de una inscripción: «Cómo pagar» (solo si el pago está pendiente) y, enseguida, el botón de cambiar de rol. Las instrucciones de pago se despliegan debajo de la fila.
// `panel` y `roleSlot` llegan ya armados desde el servidor; aquí solo vive el abrir y cerrar.
export function RegActions({ payLabel, panel, roleSlot }: { payLabel: string | null; panel: React.ReactNode; roleSlot: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!payLabel && !roleSlot) return null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {payLabel && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="pay-toggle"
            className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium hover:border-ink">{payLabel}</button>
        )}
        {roleSlot}
      </div>
      {payLabel && open && <div className="mt-2 rounded-xl bg-sand p-3 text-sm">{panel}</div>}
    </div>
  );
}
