import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { RegistroForm } from "./RegistroForm";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ props }: { props: PageProps<"/[lang]/registro"> }) {
  const lang = await resolveLang(props.params);
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const a = t.auth, g = t.legal;
  return (
    <RegistroForm lang={lang} termsError={sp.error === "terms"} l={{
      title: a.createAccount, participant: a.participant, organizer: a.organizer, participantBlurb: a.participantBlurb, organizerBlurb: a.organizerBlurb,
      fullName: a.fullName, phone: a.phone, email: a.email, sendCode: a.sendCode, create: a.create, code: a.code, verify: a.verify, demoNote: a.demoNote, continue: a.continue,
      acceptPrefix: g.acceptPrefix, and: g.and, terms: g.terms, privacy: g.privacy, termsHref: `/${lang}/terminos`, privacyHref: `/${lang}/privacidad`, phoneNote: g.phoneNote, acceptError: g.acceptError,
    }} />
  );
}

export default function Registro(props: PageProps<"/[lang]/registro">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
