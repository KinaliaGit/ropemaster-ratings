import { OrgTabs } from "@/components/OrgTabs";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

export function OrgNav({ lang, t }: { lang: Lang; t: Dict }) {
  const base = `/${lang}/organizador`;
  return (
    <OrgTabs
      tabs={[
        { href: base, label: t.org.tabs.summary, match: [`${base}/eventos`] },
        { href: `${base}/participantes`, label: t.org.tabs.participants },
        { href: `${base}/app`, label: t.org.tabs.app },
      ]}
      publicHref={`/${lang}`} publicLabel={t.nav.publicSite}
    />
  );
}
