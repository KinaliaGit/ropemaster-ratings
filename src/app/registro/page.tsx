"use client";
import { useState } from "react";
import { login } from "@/lib/auth-actions";

type Role = "participante" | "organizador";

export default function Registro() {
  const [role, setRole] = useState<Role>("participante");
  const [step, setStep] = useState<"datos" | "codigo" | "listo">("datos");
  // TODO: Supabase Auth. Participante: verifica celular por código y reclama el perfil existente.
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="font-display text-3xl font-extrabold">Crear cuenta</h1>
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-sand p-1 text-sm font-semibold">
        {(["participante", "organizador"] as Role[]).map((r) => (
          <button key={r} type="button" onClick={() => { setRole(r); setStep("datos"); }}
            className={`rounded-full py-2 capitalize ${role === r ? "bg-ink text-cream" : "text-muted"}`}>{r}</button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">
        {role === "participante"
          ? "Lazadores, barrileras y demás participantes: inscríbete a eventos, paga y consulta tu historial. Si un organizador ya te registró con tu celular, aquí reclamas ese perfil."
          : "Crea y publica eventos, y recibe las inscripciones y pagos de los participantes."}
      </p>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); setStep(step === "datos" && role === "participante" ? "codigo" : "listo"); }}>
        {step === "datos" && (<>
          <label className="block text-sm font-semibold">Nombre completo
            <input required className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3" />
          </label>
          <label className="block text-sm font-semibold">Celular
            <input required type="tel" placeholder="+52 55 1234 5678" className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 font-mono" />
          </label>
          {role === "organizador" && (
            <label className="block text-sm font-semibold">Correo
              <input required type="email" className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3" />
            </label>
          )}
          <button className="w-full rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hot">{role === "participante" ? "Enviar código" : "Crear cuenta"}</button>
        </>)}
        {step === "codigo" && (<>
          <label className="block text-sm font-semibold">Código de 6 dígitos
            <input required inputMode="numeric" maxLength={6} className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.4em]" />
          </label>
          <button className="w-full rounded-full bg-ink py-3 font-semibold text-cream hover:bg-brand-hot">Verificar</button>
        </>)}
      </form>
      {step === "listo" && (
        <form action={login} className="mt-4 space-y-3">
          <p className="rounded-xl bg-brand-soft p-4 text-sm font-semibold">Vista de ejemplo: el registro real se conecta con Supabase. Continúa en modo demostración.</p>
          <input type="hidden" name="role" value={role} />
          <button className="w-full rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hot">Continuar</button>
        </form>
      )}
    </div>
  );
}
