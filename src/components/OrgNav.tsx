import Link from "next/link";
import type { Dict } from "@/dictionaries/es";
import type { Lang } from "@/lib/format";

export function OrgNav({ lang, t }: { lang: Lang; t: Dict }) {
  const items = [
    [`/${lang}/organizador`, t.org.tabs.summary],
    [`/${lang}/organizador/participantes`, t.org.tabs.participants],
    [`/${lang}/organizador/app`, t.org.tabs.app],
  ];
  return (
    <nav className="mx-auto flex max-w-6xl gap-6 overflow-x-auto px-5 pt-6 text-sm font-medium">
      {items.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap text-muted transition hover:text-ink">{label}</Link>)}
      <Link href={`/${lang}`} className="ml-auto whitespace-nowrap text-muted transition hover:text-ink">{t.nav.publicSite} ↗</Link>
    </nav>
  );
}
