import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { requestPasswordReset } from "@/lib/auth-actions";
import { getDictionary, resolveLang } from "@/lib/i18n";

const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

// Recuperar la contraseña (KIN-601): pide el correo. La respuesta es la misma tenga cuenta o no.
async function Form({ props }: { props: PageProps<"/[lang]/recuperar"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const r = t.recovery;
  const sp = await props.searchParams;
  const role = sp.role === "participante" ? "participante" : "organizador";
  const errors: Record<string, string> = { expired: r.errorExpired, email: r.errorEmail };
  return (
    <div className="page-narrow">
      <h1 className="text-3xl font-semibold">{r.title}</h1>
      <p className="mt-2 text-muted">{r.intro}</p>
      {typeof sp.error === "string" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{errors[sp.error] ?? t.auth.errorGeneric}</p>}
      {sp.sent === "1" && <p role="status" className="mt-4 rounded-xl bg-brand-soft p-3 text-sm">{r.sent}</p>}
      <form action={requestPasswordReset} className="card mt-4 space-y-4 p-6">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="role" value={role} />
        <label className="block text-sm font-medium">{t.auth.email}<input required type="email" name="email" autoComplete="email" className={field} /></label>
        <button className="w-full rounded-full bg-ink py-3 text-sm font-medium text-white transition hover:bg-brand-hot">{r.send}</button>
      </form>
      <p className="mt-6 text-center text-sm"><Link href={`/${lang}/entrar?role=${role}`} className="inline-block py-2 font-medium text-brand-hot underline">{r.back}</Link></p>
    </div>
  );
}

export default function Recuperar(props: PageProps<"/[lang]/recuperar">) {
  return <Suspense fallback={<PageSkeleton />}><Form props={props} /></Suspense>;
}
