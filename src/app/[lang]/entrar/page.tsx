import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { RoleToggle } from "@/components/RoleToggle";
import { signIn } from "@/lib/auth-actions";
import { getDictionary, resolveLang } from "@/lib/i18n";

const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

async function Form({ props }: { props: PageProps<"/[lang]/entrar"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const a = t.auth;
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const role = sp.role === "participante" ? "participante" : "organizador";
  const q = (r: string) => `/${lang}/entrar?role=${r}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  const errors: Record<string, string> = { invalid: a.errorInvalid, role: a.errorRoleOrganizer, unconfirmed: a.errorUnconfirmed, confirm: a.errorConfirm };
  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-14">
      <h1 className="text-3xl font-semibold">{a.signInTitle}</h1>
      {typeof sp.error === "string" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{errors[sp.error] ?? a.errorGeneric}</p>}
      {next && !sp.error && <p className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">{a.needAccount}</p>}

      <RoleToggle role={role} href={q} labels={{ organizador: a.organizer, participante: a.participant }} />
      <form action={signIn} className="card mt-4 space-y-4 p-6">
        <p className="label">{role === "organizador" ? a.organizerAccess : a.participantAccess}</p>
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium">{a.email}<input required type="email" name="email" autoComplete="email" className={field} /></label>
        <label className="block text-sm font-medium">{a.password}<input required type="password" name="password" autoComplete="current-password" className={field} /></label>
        <button className="w-full rounded-full bg-ink py-3 text-sm font-medium text-white transition hover:bg-brand-hot">{a.signInBtn}</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">{a.firstTime} <Link href={`/${lang}/registro?role=${role}`} className="font-medium text-brand-hot underline">{a.createAccount}</Link></p>
    </div>
  );
}

export default function Entrar(props: PageProps<"/[lang]/entrar">) {
  return <Suspense fallback={<PageSkeleton />}><Form props={props} /></Suspense>;
}
