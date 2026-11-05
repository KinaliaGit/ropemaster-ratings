"use client";
import { useActionState } from "react";
import { createParticipant, type CreateParticipantState } from "@/lib/participant-actions";

export type AddLabels = {
  title: string; blurb: string; name: string; email: string; emailHint: string; consent: string; btn: string; added: string; duplicate: string;
  errors: { unauthorized: string; invalid_name: string; invalid_email: string; consent: string; failed: string };
};

const input = "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-normal outline-none focus:border-ink";

// Alta de un participante por un organizador verificado, con su nombre y correo (el correo es único).
export function AddParticipantForm({ l }: { l: AddLabels }) {
  const [state, action, pending] = useActionState<CreateParticipantState, FormData>(createParticipant, null);
  const dup = state && !state.ok && state.error === "duplicate" ? state : null;
  const err = state && !state.ok && state.error !== "duplicate" ? l.errors[state.error] : null;
  return (
    <section className="card mt-6 p-5">
      <h2 className="text-lg font-semibold">{l.title}</h2>
      <p className="mt-1 text-sm text-muted">{l.blurb}</p>
      <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">{l.name}<input name="name" required minLength={2} maxLength={80} autoComplete="off" className={input} /></label>
        <label className="text-sm font-medium">{l.email}
          <input name="email" type="email" required maxLength={200} autoComplete="off" className={input} />
          <span className="mt-1 block text-xs font-normal text-muted">{l.emailHint}</span>
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input name="consent" type="checkbox" required className="mt-0.5 size-4" /><span>{l.consent}</span></label>
        {dup && <p role="alert" className="rounded-2xl border border-line bg-sand p-4 text-sm sm:col-span-2">{l.duplicate}{dup.name ? <> <strong>{dup.name}</strong></> : null}</p>}
        {err && <p role="alert" className="text-sm font-medium text-brand-hot sm:col-span-2">{err}</p>}
        {state?.ok && <p role="status" className="text-sm font-medium sm:col-span-2">{l.added} {state.name}</p>}
        <div className="sm:col-span-2"><button disabled={pending} className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot disabled:opacity-60">{l.btn}</button></div>
      </form>
    </section>
  );
}
