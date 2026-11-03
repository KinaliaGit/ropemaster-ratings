import { LegalPage } from "@/components/LegalPage";
import { privacyEs } from "@/legal/es";
import { privacyEn } from "@/legal/en";
import { getDictionary, resolveLang } from "@/lib/i18n";

export default async function Privacidad({ params }: PageProps<"/[lang]/privacidad">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  return <LegalPage doc={lang === "es" ? privacyEs : privacyEn} otherHref={`/${lang}/terminos`} otherLabel={t.legal.terms} />;
}
