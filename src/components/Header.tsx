import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";
import { LangSwitch } from "@/components/LangSwitch";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

const link = "px-3 py-2 text-sm font-medium text-ink/70 transition hover:text-ink";
const cta = "rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hot";

async function AuthNav({ lang, t }: { lang: Lang; t: Dict }) {
  const s = await getSession();
  if (!s) return <Link href={`/${lang}/entrar`} className={cta}>{t.nav.signIn}</Link>;
  return (
    <>
      <Link href={`/${lang}/${s.role === "organizador" ? "organizador" : "mi-cuenta"}`} className={cta}>{s.role === "organizador" ? t.nav.myPanel : t.nav.myAccount}</Link>
      <form action={logout}><input type="hidden" name="lang" value={lang} /><button className={link}>{t.nav.signOut}</button></form>
    </>
  );
}

// Navbar sin fondo: solo desenfoque, flota sobre la página.
export function Header({ lang, t }: { lang: Lang; t: Dict }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
        <Link href={`/${lang}`} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={32} height={32} className="size-8" /><span className="hidden sm:inline">{t.common.brand}</span><span className="hidden font-normal text-muted md:inline">{t.common.ratings}</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href={`/${lang}`} className={link}>{t.nav.events}</Link>
          <Link href={`/${lang}/participantes`} className={link}>{t.nav.participants}</Link>
          <LangSwitch lang={lang} label={t.nav.language} />
          <Suspense fallback={<span className="h-9 w-20" />}><AuthNav lang={lang} t={t} /></Suspense>
        </nav>
      </div>
    </header>
  );
}
