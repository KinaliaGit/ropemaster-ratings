"use client";
import { useEffect, useRef, useState } from "react";
import { mxn, type Lang } from "@/lib/format";
import { enrollPackages, type EnrollRole } from "@/lib/enroll-packages";

type Labels = {
  roleTitle: string; roleHint: string; header: string; heeler: string; both: string; marked: string;
  packages: string; packagesHint: string; packagesHeader: string; packagesHeeler: string; sidesHint: string; needOne: string;
  total: string; package: string; packagesWord: string; shot: string; shots: string;
};

// Rol y paquetes al inscribirse a Lazada Sorteada (KIN-793), para CUALQUIER perfil: se elige el rol otra vez y viene marcado el del perfil (el favorito
// si el perfil es "Ambos"). El rol de la inscripción no cambia el perfil.
//  * Cabecero o Pialador: un solo número de paquetes (campo `packages`), como siempre.
//  * Ambos ("los dos"): los paquetes de cada lado POR SEPARADO (`packages_header` y `packages_heeler`, de 0 a 99, al menos 1 en total). Cada lado con
//    paquetes es una inscripción con su lugar en el cupo.
// El resumen (paquetes, tiros y total a pagar) sigue a la categoría marcada en el mismo formulario; es solo informativo: el monto lo calcula la base.
export function EnrollRoleAndPackages({ lang, categories, shotsPerPackage, defaultRole, markedRole, labels }: {
  lang: Lang; categories: { id: string; fee: number }[]; shotsPerPackage: number | null; defaultRole: "header" | "heeler"; markedRole: "header" | "heeler" | null; labels: Labels;
}) {
  const [role, setRole] = useState<EnrollRole>(defaultRole);
  const [single, setSingle] = useState("1");
  const [header, setHeader] = useState("1");
  const [heeler, setHeeler] = useState("1");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const root = useRef<HTMLDivElement>(null);

  // La categoría se elige en el mismo formulario (radios): se sigue su cambio para actualizar el total.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const read = () => { const checked = form.querySelector<HTMLInputElement>('input[name="category"]:checked'); if (checked) setCategoryId(checked.value); };
    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, []);

  const p = enrollPackages(role, { single, header, heeler });
  const fee = categories.find((c) => c.id === categoryId)?.fee ?? categories[0]?.fee ?? 0;
  const shots = shotsPerPackage === null ? null : p.total * shotsPerPackage;
  const hint = (text: string) => text.replace("{shots}", shotsPerPackage === null ? "—" : String(shotsPerPackage));
  const field = (name: string, label: string, value: string, set: (v: string) => void, min: number) => (
    <label className="block text-sm font-medium">{label}
      <input name={name} type="number" required min={min} max={99} step={1} value={value} onChange={(e) => set(e.target.value)} inputMode="numeric" className="mt-1 w-28 rounded-xl border border-line bg-white px-3 py-2 tabular-nums outline-none focus:border-ink" />
    </label>
  );
  const roleName = (r: EnrollRole) => (r === "both" ? labels.both : r === "header" ? labels.header : labels.heeler);
  return (
    <div ref={root} className="space-y-5" data-testid="role-and-packages">
      <fieldset>
        <legend className="text-sm font-medium">{labels.roleTitle}</legend>
        {(["header", "heeler", "both"] as const).map((r) => (
          <label key={r} className="mt-2 flex cursor-pointer items-center rounded-xl border border-line p-3 has-checked:border-ink has-checked:bg-sand">
            <input type="radio" name="role" value={r} required checked={role === r} onChange={() => setRole(r)} className="mr-2 accent-brand" />
            {roleName(r)}
            {r === markedRole && <span className="ml-2 text-xs text-muted">({labels.marked})</span>}
          </label>
        ))}
        <p className="mt-2 text-xs text-muted">{labels.roleHint}</p>
      </fieldset>
      {role === "both" ? (
        <div className="space-y-3" data-testid="packages-by-side">
          <div className="flex flex-wrap gap-4">
            {field("packages_header", labels.packagesHeader, header, setHeader, 0)}
            {field("packages_heeler", labels.packagesHeeler, heeler, setHeeler, 0)}
          </div>
          <p className="text-xs text-muted">{hint(labels.sidesHint)}</p>
          {!p.valid && <p role="alert" className="text-xs font-medium text-red-800">{labels.needOne}</p>}
        </div>
      ) : (
        <div className="space-y-1" data-testid="packages-single">
          {field("packages", labels.packages, single, setSingle, 1)}
          <p className="text-xs text-muted">{hint(labels.packagesHint)}</p>
        </div>
      )}
      <p aria-live="polite" className="rounded-xl bg-sand p-3 text-sm" data-testid="packages-total">
        <span className="font-medium">{labels.total}: </span>
        <span className="tabular-nums">{p.total} {p.total === 1 ? labels.package : labels.packagesWord}{shots === null ? "" : ` · ${shots} ${shots === 1 ? labels.shot : labels.shots}`} · {mxn(fee * p.total, lang)}</span>
      </p>
    </div>
  );
}
