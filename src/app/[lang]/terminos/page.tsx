import { LegalPage } from "@/components/LegalPage";
import { termsEs } from "@/legal/es";
import { termsEn } from "@/legal/en";
import { getDictionary, resolveLang } from "@/lib/i18n";
import type { Metadata } from "next";
import { pageAlternates } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/terminos">): Promise<Metadata> {
  const lang = await resolveLang(params);
  return { title: getDictionary(lang).legal.terms, alternates: pageAlternates(lang, "/terminos") };
}

export default async function Terminos({ params }: PageProps<"/[lang]/terminos">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  return <LegalPage doc={lang === "es" ? termsEs : termsEn} otherHref={`/${lang}/privacidad`} otherLabel={t.legal.privacy} />;
}
