"use client";
import { useState } from "react";
import { registerAccount, resendConfirmation } from "@/lib/auth-actions";

type Role = "participante" | "organizador";
type Labels = {
  title: string; participantBlurb: string; organizerBlurb: string; fullName: string; email: string; password: string; passwordHint: string; create: string;
  acceptPrefix: string; and: string; terms: string; privacy: string; termsHref: string; privacyHref: string;
  errors: Record<string, string>; checkEmail: string; resend: string; resent: string; roles: { organizador: string; participante: string };
};

const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";
const link = "font-medium underline underline-offset-2 hover:text-brand-hot";
const primary = "w-full rounded-full bg-brand py-3 text-sm font-medium text-white transition hover:bg-brand-hot disabled:cursor-not-allowed disabled:opacity-50";

// Crear cuenta con correo y contraseña, como organizador o como participante.
export function RegistroForm({ lang, l, error, checkEmail, initialRole, email, resent }: { lang: "es" | "en"; l: Labels; error?: string; checkEmail?: boolean; initialRole: Role; email?: string; resent?: boolean }) {
  const [role, setRole] = useState<Role>(initialRole);
  const [accepted, setAccepted] = useState(false);
  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-14">
      <h1 className="text-3xl font-semibold">{l.title}</h1>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{l.errors[error] ?? l.errors.generic}</p>}
      {checkEmail && (
        <div role="status" className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">
          <p>{l.checkEmail}</p>
          {resent && <p className="mt-1 font-medium">{l.resent}</p>}
          {email && (
            <form action={resendConfirmation} className="mt-2">
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="role" value={initialRole} /><input type="hidden" name="email" value={email} />
              <button className="font-medium underline underline-offset-2 hover:text-brand-hot">{l.resend}</button>
            </form>
          )}
        </div>
      )}
      <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-sand p-1 text-sm font-medium">
        {(["organizador", "participante"] as Role[]).map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)} className={`rounded-full py-2 ${role === r ? "bg-ink text-white" : "text-muted"}`}>{l.roles[r]}</button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{role === "participante" ? l.participantBlurb : l.organizerBlurb}</p>

      <form action={registerAccount} className="mt-6 space-y-4">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="role" value={role} />
        <label className="block text-sm font-medium">{l.fullName}<input required name="name" autoComplete="name" minLength={2} maxLength={80} className={field} /></label>
        <label className="block text-sm font-medium">{l.email}<input required type="email" name="email" autoComplete="email" className={field} /></label>
        <label className="block text-sm font-medium">{l.password}<input required type="password" name="password" autoComplete="new-password" minLength={8} maxLength={72} className={field} /><span className="mt-1 block text-xs font-normal text-muted">{l.passwordHint}</span></label>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" name="accept" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand" />
          <span>{l.acceptPrefix} <a href={l.termsHref} target="_blank" rel="noopener noreferrer" className={link}>{l.terms}</a> {l.and} <a href={l.privacyHref} target="_blank" rel="noopener noreferrer" className={link}>{l.privacy}</a>.</span>
        </label>
        <button disabled={!accepted} className={primary}>{l.create}</button>
      </form>
    </div>
  );
}
