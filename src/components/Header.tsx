import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/session";
import { countMyUnread } from "@/lib/data/notifications";
import { logout } from "@/lib/auth-actions";
import { NoticeBanner } from "@/components/NoticeBanner";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { AccountMenu } from "@/components/AccountMenu";
import { initials, publicAvatarUrl } from "@/lib/people";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

async function Account({ lang, t }: { lang: Lang; t: Dict }) {
  const s = await getSession();
  if (!s) return <Link href={`/${lang}/entrar`} className="whitespace-nowrap rounded-full bg-ink px-2.5 py-2 text-xs font-medium text-white transition hover:bg-brand-hot sm:px-4 sm:text-sm">{t.nav.signInOrUp}</Link>;
  const org = s.role === "organizador";
  const unread = await countMyUnread();
  const base = `/${lang}/organizador`;
  // En celular la barra se guarda aquí: estos enlaces solo salen en el menú en pantallas chicas. «Mi panel» ya es el primero del menú.
  const phone = barItems(lang, t, org).filter((i) => i.href !== base).map((i) => ({ href: i.href, label: i.label, className: "sm:hidden" }));
  return (
    <>
    <Link href={`/${lang}/notificaciones`} aria-label={unread > 0 ? `${t.notifications.bell} (${unread})` : t.notifications.bell} className="relative mr-2 grid size-9 place-items-center rounded-full hover:bg-sand">
      <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-brand-hot px-1 text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
    </Link>
    <AccountMenu
      initials={initials(s.name)} photo={publicAvatarUrl(s.avatarPath)} name={s.name} roleLabel={org ? t.org.accountType : t.account.type} lang={lang}
      dashboardHref={`/${lang}/${org ? "organizador" : "mi-cuenta"}`} dashboardLabel={org ? t.nav.myPanel : t.nav.myAccount}
      // Lo que no está en la barra vive aquí. «App local» (KIN-761) solo la muestra; la página sigue protegida por su cuenta.
      extras={[...phone, ...(org ? [
        { href: `${base}/series`, label: t.nav.series, separated: true },
        { href: `${base}/arenas`, label: t.nav.arenas },
        { href: `/${lang}/mi-cuenta`, label: s.hasRoper ? t.nav.myLazador : t.nav.createLazador, separated: true },
        { href: `${base}/app`, label: t.nav.localApp },
        { href: `/${lang}`, label: t.nav.publicSite, separated: true },
      ] : [])]}
      signOutLabel={t.nav.signOut} signOut={logout}
    />
    </>
  );
}

// Enlaces de la barra. El organizador ve su panel (ahí están sus eventos; la portada queda en el menú), el directorio de participantes y
// los pagos; los demás, las páginas públicas. Cada página vuelve a comprobar el permiso.
const publicItems = (lang: Lang, t: Dict): NavItem[] => [
  { href: `/${lang}`, label: t.nav.events, exact: true },
  { href: `/${lang}/participantes`, label: t.nav.participants },
];

function barItems(lang: Lang, t: Dict, organizer: boolean): NavItem[] {
  if (!organizer) return publicItems(lang, t);
  const base = `/${lang}/organizador`;
  return [
    { href: base, label: t.nav.panel, except: [`${base}/pagos`] },
    publicItems(lang, t)[1], // Participantes: el mismo directorio que ve todo el mundo, con la info de cada lazador
    { href: `${base}/pagos`, label: t.nav.payments },
  ];
}

// Sin sesión, los enlaces se ven siempre. Con sesión, en celular se guardan en el menú de la cuenta.
async function Links({ lang, t }: { lang: Lang; t: Dict }) {
  const s = await getSession();
  if (!s) return <NavLinks items={publicItems(lang, t)} />;
  return <div className="hidden sm:block"><NavLinks items={barItems(lang, t, s.role === "organizador")} /></div>;
}

// El logo lleva al inicio de cada quien: el panel para el organizador y la portada para los demás.
async function Brand({ lang, t }: { lang: Lang; t: Dict }) {
  const s = await getSession();
  return <Logo href={s?.role === "organizador" ? `/${lang}/organizador` : `/${lang}`} t={t} />;
}

function Logo({ href, t }: { href: string; t: Dict }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2.5 text-[17px] font-semibold tracking-tight">
      <Image src="/logo.png" alt="" width={32} height={32} loading="eager" className="size-8" />
      <span className="hidden min-[360px]:inline sm:hidden lg:inline">{t.common.brand}</span>
    </Link>
  );
}

// Navbar sin fondo (solo desenfoque): logo · enlaces centrados · cuenta. El idioma va en un botón flotante (LangSwitch).
export function Header({ lang, t }: { lang: Lang; t: Dict }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-5 sm:gap-3 md:grid md:grid-cols-[1fr_auto_1fr]">
        <Suspense fallback={<Logo href={`/${lang}`} t={t} />}><Brand lang={lang} t={t} /></Suspense>
        <div className="md:justify-self-center"><Suspense fallback={<NavLinks items={publicItems(lang, t)} />}><Links lang={lang} t={t} /></Suspense></div>
        <div className="flex items-center justify-end">
          <Suspense fallback={<span className="size-9" />}><Account lang={lang} t={t} /></Suspense>
        </div>
      </div>
      <Suspense fallback={null}><NoticeBanner lang={lang} t={t} /></Suspense>
    </header>
  );
}
