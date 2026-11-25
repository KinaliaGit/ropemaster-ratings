import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { setNewPassword } from "@/lib/auth-actions";
import { getDictionary, resolveLang } from "@/lib/i18n";
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/password-reset";
import { createServerSupabase } from "@/lib/supabase/server";

const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink";

// Elegir la contraseña nueva (KIN-601). Se llega por el enlace del correo, que dejó la sesión; sin sesión (enlace ya usado o vencido) se pide otro.
async function Form({ props }: { props: PageProps<"/[lang]/recuperar/nueva"> }) {
  await connection();
  const lang = await resolveLang(props.params);
  const { data } = await (await createServerSupabase()).auth.getUser();
  if (!data.user) redirect(`/${lang}/recuperar?error=expired`);
  const r = getDictionary(lang).recovery;
  const sp = await props.searchParams;
  const errors: Record<string, string> = { short: r.errorShort, long: r.errorLong, mismatch: r.errorMismatch, same: r.errorSame, weak: r.errorWeak };
  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-14">
      <h1 className="text-3xl font-semibold">{r.newTitle}</h1>
      <p className="mt-2 text-muted">{r.newIntro}</p>
      {typeof sp.error === "string" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{errors[sp.error] ?? r.errorGeneric}</p>}
      <form action={setNewPassword} className="card mt-4 space-y-4 p-6">
        <input type="hidden" name="lang" value={lang} />
        <label className="block text-sm font-medium">{r.newPassword}<input required type="password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD} maxLength={MAX_PASSWORD} className={field} /></label>
        <label className="block text-sm font-medium">{r.confirmPassword}<input required type="password" name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD} maxLength={MAX_PASSWORD} className={field} /></label>
        <button className="w-full rounded-full bg-ink py-3 text-sm font-medium text-white transition hover:bg-brand-hot">{r.save}</button>
      </form>
    </div>
  );
}

export default function NuevaContrasena(props: PageProps<"/[lang]/recuperar/nueva">) {
  return <Suspense fallback={<PageSkeleton />}><Form props={props} /></Suspense>;
}
