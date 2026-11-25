import { OrgTabs } from "@/components/OrgTabs";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

export function OrgNav({ lang, t, admin = false }: { lang: Lang; t: Dict; admin?: boolean }) {
  const base = `/${lang}/organizador`;
  return (
    <OrgTabs
      tabs={[
        { href: base, label: t.org.tabs.summary, match: [`${base}/eventos`] },
        { href: `${base}/series`, label: t.org.tabs.series, match: [`${base}/series`] },
        { href: `${base}/participantes`, label: t.org.tabs.participants },
        { href: `${base}/pagos`, label: t.org.tabs.payments },
        { href: `${base}/arenas`, label: t.org.tabs.arenas },
        ...(admin ? [{ href: `${base}/admin`, label: t.org.tabs.admin, short: t.org.tabs.adminShort }] : []),
        { href: `${base}/app`, label: t.org.tabs.app, short: t.org.tabs.appShort }, // "App local" siempre es la última
      ]}
      publicHref={`/${lang}`} publicLabel={t.nav.publicSite}
    />
  );
}
