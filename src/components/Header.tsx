import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { logout } from "@/lib/auth-actions";
import { NavLinks } from "@/components/NavLinks";
import { AccountMenu } from "@/components/AccountMenu";
import { initials } from "@/lib/mock";
import { avatarUrl } from "@/lib/avatars";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

async function Account({ lang, t }: { lang: Lang; t: Dict }) {
  const s = await getSession();
  if (!s) return <Link href={`/${lang}/entrar`} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hot">{t.nav.signIn}</Link>;
  const org = s.role === "organizador";
  return (
    <AccountMenu
      initials={initials(s.name)} photo={org ? null : avatarUrl(s.id)} name={s.name} roleLabel={org ? t.org.accountType : t.account.type} lang={lang}
      dashboardHref={`/${lang}/${org ? "organizador" : "mi-cuenta"}`} dashboardLabel={org ? t.nav.myPanel : t.nav.myAccount}
      signOutLabel={t.nav.signOut} signOut={logout}
    />
  );
}

// Navbar sin fondo (solo desenfoque): logo · enlaces centrados · cuenta. El idioma va en un botón flotante (LangSwitch).
export function Header({ lang, t }: { lang: Lang; t: Dict }) {
  const items = [{ href: `/${lang}`, label: t.nav.events }, { href: `/${lang}/participantes`, label: t.nav.participants }];
  return (
    <header className="fixed inset-x-0 top-0 z-50 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link href={`/${lang}`} className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={32} height={32} className="size-8" />
          <span className="hidden sm:inline">{t.common.brand}</span>
        </Link>
        <div className="md:justify-self-center"><NavLinks items={items} /></div>
        <div className="flex items-center justify-end">
          <Suspense fallback={<span className="size-9" />}><Account lang={lang} t={t} /></Suspense>
        </div>
      </div>
    </header>
  );
}
