"use client";
import { useState } from "react";
import type { RoleChoice, RoperRole } from "@/lib/roles";

export type RoleFieldLabels = { legend: string; header: string; heeler: string; both: string; favoriteLegend: string };

const pill = "flex cursor-pointer items-center justify-center rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium has-checked:border-ink has-checked:bg-sand";

// Con qué rol compite (cabecero, pialador o ambos) y, si son ambos, su favorito. Campos: `roperRole` y `roperFavorite`.
// Siempre obligatorio: se usa al crear la cuenta, al crear el perfil de lazador y al cambiar el rol desde Mi cuenta.
export function RoleFields({ labels: l, initial }: { labels: RoleFieldLabels; initial?: RoleChoice | null }) {
  const [role, setRole] = useState<RoperRole | null>(initial?.role ?? null);
  return (
    <>
      <fieldset>
        <legend className="text-sm font-medium">{l.legend}</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["header", "heeler", "both"] as RoperRole[]).map((r) => (
            <label key={r} className={pill}>
              <input type="radio" name="roperRole" value={r} required checked={role === r} onChange={() => setRole(r)} className="sr-only" />{l[r]}
            </label>
          ))}
        </div>
      </fieldset>
      {role === "both" && (
        <fieldset>
          <legend className="text-sm font-medium">{l.favoriteLegend}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["header", "heeler"] as const).map((r) => (
              <label key={r} className={pill}>
                <input type="radio" name="roperFavorite" value={r} required defaultChecked={initial?.favorite === r} className="sr-only" />{l[r]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}
