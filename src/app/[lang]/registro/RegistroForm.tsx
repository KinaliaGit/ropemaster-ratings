"use client";
import { useState } from "react";
import { register, registerOrganizer } from "@/lib/auth-actions";

type Role = "participante" | "organizador";
type Labels = {
  title: string; participant: string; organizer: string; participantBlurb: string; organizerBlurb: string; fullName: string; phone: string; email: string; password: string; passwordHint: string;
  sendCode: string; create: string; code: string; verify: string; demoNote: string; continue: string;
  acceptPrefix: string; and: string; terms: string; privacy: string; termsHref: string; privacyHref: string; phoneNote: string;
  errors: Record<string, string>; checkEmail: string;
};

const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";
const link = "font-medium underline underline-offset-2 hover:text-brand-hot";
const primary = "w-full rounded-full bg-brand py-3 text-sm font-medium text-white transition hover:bg-brand-hot disabled:cursor-not-allowed disabled:opacity-50";

export function RegistroForm({ lang, l, error, checkEmail }: { lang: "es" | "en"; l: Labels; error?: string; checkEmail?: boolean }) {
  const [role, setRole] = useState<Role>("organizador");
  const [step, setStep] = useState<"datos" | "codigo" | "listo">("datos");
  const [accepted, setAccepted] = useState(false);

  const consent = (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" name="accept" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand" />
      <span>{l.acceptPrefix} <a href={l.termsHref} target="_blank" rel="noopener noreferrer" className={link}>{l.terms}</a> {l.and} <a href={l.privacyHref} target="_blank" rel="noopener noreferrer" className={link}>{l.privacy}</a>.</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-14">
      <h1 className="text-3xl font-semibold">{l.title}</h1>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{l.errors[error] ?? l.errors.generic}</p>}
      {checkEmail && <p role="status" className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">{l.checkEmail}</p>}
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-sand p-1 text-sm font-medium">
        {(["organizador", "participante"] as Role[]).map((r) => (
          <button key={r} type="button" onClick={() => { setRole(r); setStep("datos"); }}
            className={`rounded-full py-2 ${role === r ? "bg-ink text-white" : "text-muted"}`}>{r === "participante" ? l.participant : l.organizer}</button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{role === "participante" ? l.participantBlurb : l.organizerBlurb}</p>

      {role === "organizador" ? (
        // Cuenta REAL de organizador: correo y contraseña.
        <form action={registerOrganizer} className="mt-6 space-y-4">
          <input type="hidden" name="lang" value={lang} />
          <label className="block text-sm font-medium">{l.fullName}<input required name="name" autoComplete="name" minLength={2} maxLength={80} className={field} /></label>
          <label className="block text-sm font-medium">{l.email}<input required type="email" name="email" autoComplete="email" className={field} /></label>
          <label className="block text-sm font-medium">{l.password}<input required type="password" name="password" autoComplete="new-password" minLength={8} maxLength={72} className={field} /><span className="mt-1 block text-xs font-normal text-muted">{l.passwordHint}</span></label>
          {consent}
          <button disabled={!accepted} className={primary}>{l.create}</button>
        </form>
      ) : (
        // Participante: flujo de DEMOSTRACIÓN (el real llegará con la verificación por celular).
        <>
          <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); setStep(step === "datos" ? "codigo" : "listo"); }}>
            {step === "datos" && (<>
              <label className="block text-sm font-medium">{l.fullName}<input required className={field} /></label>
              <label className="block text-sm font-medium">{l.phone}<input required type="tel" placeholder="+52 55 1234 5678" className={`${field} tabular-nums`} /></label>
              <p className="text-xs text-muted">{l.phoneNote}</p>
              {consent}
              <button disabled={!accepted} className={primary}>{l.sendCode}</button>
            </>)}
            {step === "codigo" && (<>
              <label className="block text-sm font-medium">{l.code}<input required inputMode="numeric" maxLength={6} className={`${field} text-center text-2xl tracking-[0.4em]`} /></label>
              <button className="w-full rounded-full bg-ink py-3 text-sm font-medium text-white hover:bg-brand-hot">{l.verify}</button>
            </>)}
          </form>
          {step === "listo" && (
            <form action={register} className="mt-4 space-y-3">
              <p className="rounded-xl bg-brand-soft p-4 text-sm font-medium">{l.demoNote}</p>
              <input type="hidden" name="role" value="participante" />
              <input type="hidden" name="lang" value={lang} />
              {accepted && <input type="hidden" name="accept" value="on" />}
              <button className={primary}>{l.continue}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
