"use client";
import { useActionState, useState } from "react";
import { organizerOtp, type OtpState } from "@/lib/auth-actions";

export type OtpLabels = {
  fullName: string; email: string; accept: React.ReactNode; sendCode: string; codeSent: string; code: string; verify: string; resend: string; changeEmail: string;
  errors: Record<"terms" | "name" | "email" | "wait" | "failed" | "code" | "noaccount", string>;
};

const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";
const primary = "w-full rounded-full bg-brand py-3 text-sm font-medium text-white transition hover:bg-brand-hot disabled:cursor-not-allowed disabled:opacity-50";

// Crear cuenta o entrar como organizador con solo el correo: escribe el correo, recibe un código y lo teclea aquí.
export function OrganizerOtpForm({ mode, lang, next = "", l }: { mode: "register" | "login"; lang: "es" | "en"; next?: string; l: OtpLabels }) {
  const [state, action, pending] = useActionState<OtpState, FormData>(organizerOtp, null);
  const [accepted, setAccepted] = useState(false);
  const error = state?.error ? l.errors[state.error] : null;
  const hidden = (<><input type="hidden" name="mode" value={mode} /><input type="hidden" name="lang" value={lang} /><input type="hidden" name="next" value={next} /></>);

  if (state?.step === "code") {
    return (
      <form action={action} className="mt-6 space-y-4">
        {hidden}
        <input type="hidden" name="email" value={state.email} /><input type="hidden" name="name" value={state.name} />
        {mode === "register" && <input type="hidden" name="accept" value="on" />}
        <p role="status" className="rounded-xl bg-brand-soft p-3 text-sm">{l.codeSent} <strong>{state.email}</strong></p>
        <label className="block text-sm font-medium">{l.code}
          <input required name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} autoFocus className={`${field} text-center text-2xl tracking-[0.4em]`} />
        </label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <button name="intent" value="verify" disabled={pending} className={primary}>{l.verify}</button>
        <div className="flex justify-between text-sm">
          <button name="intent" value="send" formNoValidate className="font-medium underline underline-offset-2 hover:text-brand-hot">{l.resend}</button>
          <button name="intent" value="reset" formNoValidate className="text-muted underline underline-offset-2 hover:text-ink">{l.changeEmail}</button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-4">
      {hidden}
      {mode === "register" && <label className="block text-sm font-medium">{l.fullName}<input required name="name" autoComplete="name" minLength={2} maxLength={80} className={field} /></label>}
      <label className="block text-sm font-medium">{l.email}<input required type="email" name="email" autoComplete="email" className={field} /></label>
      {mode === "register" && (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" name="accept" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand" />
          <span>{l.accept}</span>
        </label>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button name="intent" value="send" disabled={pending || (mode === "register" && !accepted)} className={primary}>{l.sendCode}</button>
    </form>
  );
}
