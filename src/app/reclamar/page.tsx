"use client";
import { useState } from "react";

export default function Reclamar() {
  const [step, setStep] = useState<"phone" | "code" | "done">("phone");
  // TODO: conectar con Supabase Auth (signInWithOtp) y Twilio.
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="font-display text-3xl font-extrabold">Reclama tu perfil</h1>
      <p className="mt-2 text-muted">Verifica tu celular para ver y administrar tu historial.</p>
      <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); setStep(step === "phone" ? "code" : "done"); }}>
        {step === "phone" && (<>
          <label className="block text-sm font-semibold">Celular
            <input required type="tel" placeholder="+52 55 1234 5678" className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 font-mono" />
          </label>
          <button className="w-full rounded-full bg-brand py-3 font-semibold text-ink hover:bg-brand-hot">Enviar código</button>
        </>)}
        {step === "code" && (<>
          <label className="block text-sm font-semibold">Código de 6 dígitos
            <input required inputMode="numeric" maxLength={6} className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.4em]" />
          </label>
          <button className="w-full rounded-full bg-ink py-3 font-semibold text-cream hover:bg-ink-soft">Verificar</button>
        </>)}
        {step === "done" && <p className="rounded-xl bg-brand-soft p-4 font-semibold">Vista de ejemplo: la verificación real se conecta en el siguiente paso.</p>}
      </form>
    </div>
  );
}
