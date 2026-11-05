import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { login } from "@/lib/auth-actions";
import { OrganizerOtpForm } from "@/components/OrganizerOtpForm";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Form({ props }: { props: PageProps<"/[lang]/entrar"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const a = t.auth;
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-14">
      <h1 className="text-3xl font-semibold">{a.signInTitle}</h1>
      {next && <p className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">{a.needAccount}</p>}

      <div className="card mt-6 p-6">
        <p className="label">{a.organizerAccess}</p>
        <OrganizerOtpForm mode="login" lang={lang} next={next} l={{ fullName: a.fullName, email: a.email, accept: null, sendCode: a.sendCode, codeSent: a.codeSent, code: a.code, verify: a.verify, resend: a.resend, changeEmail: a.changeEmail, errors: a.otpErrors }} />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{a.or}<span className="h-px flex-1 bg-line" /></div>

      {/* Participante de demostración: los participantes reales entrarán con su celular. */}
      <form action={login} className="space-y-2">
        <input type="hidden" name="role" value="participante" />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="lang" value={lang} />
        <button className="w-full rounded-full bg-sand py-3 text-sm font-medium transition hover:bg-line">{a.demoParticipant}</button>
        <p className="text-center text-xs text-muted">{a.demoParticipantNote}</p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{a.firstTime} <Link href={`/${lang}/registro`} className="font-medium text-brand-hot underline">{a.createAccount}</Link></p>
    </div>
  );
}

export default function Entrar(props: PageProps<"/[lang]/entrar">) {
  return <Suspense fallback={<PageSkeleton />}><Form props={props} /></Suspense>;
}
