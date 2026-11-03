import Link from "next/link";
import { Suspense } from "react";
import { login } from "@/lib/auth-actions";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Form({ props }: { props: PageProps<"/[lang]/entrar"> }) {
  const lang = await resolveLang(props.params);
  const t = getDictionary(lang);
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const preferred = sp.role === "organizador" ? "organizador" : "participante";
  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-14">
      <h1 className="text-3xl font-semibold">{t.auth.signInTitle}</h1>
      {next && <p className="mt-3 rounded-xl bg-brand-soft p-3 text-sm">{t.auth.needAccount}</p>}
      {/* TODO: reemplazar por Supabase Auth (OTP por celular para participantes, correo para organizadores). */}
      <div className="card mt-6 space-y-3 p-6">
        <p className="label">{t.auth.demoMode}</p>
        {(["participante", "organizador"] as const).map((role) => (
          <form key={role} action={login}>
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="lang" value={lang} />
            <button className={`w-full rounded-full py-3 text-sm font-medium ${role === preferred ? "bg-ink text-white hover:bg-brand-hot" : "bg-sand hover:bg-line"}`}>
              {role === "participante" ? t.auth.asParticipant : t.auth.asOrganizer}
            </button>
          </form>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-muted">{t.auth.firstTime} <Link href={`/${lang}/registro`} className="font-medium text-brand-hot underline">{t.auth.createAccount}</Link></p>
    </div>
  );
}

export default function Entrar(props: PageProps<"/[lang]/entrar">) {
  return <Suspense fallback={null}><Form props={props} /></Suspense>;
}
