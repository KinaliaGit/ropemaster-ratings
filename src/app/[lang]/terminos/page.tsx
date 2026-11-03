import { LegalPage } from "@/components/LegalPage";
import { termsEs } from "@/legal/es";
import { termsEn } from "@/legal/en";
import { getDictionary, resolveLang } from "@/lib/i18n";

export default async function Terminos({ params }: PageProps<"/[lang]/terminos">) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  return <LegalPage doc={lang === "es" ? termsEs : termsEn} otherHref={`/${lang}/privacidad`} otherLabel={t.legal.privacy} />;
}
