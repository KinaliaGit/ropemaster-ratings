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
    <RegistroForm lang={lang} initialRole={sp.role === "participante" ? "participante" : "organizador"} error={typeof sp.error === "string" ? sp.error : undefined} checkEmail={sp.check === "email"} email={typeof sp.email === "string" ? sp.email : undefined} resent={sp.resent === "1"} l={{
      title: a.createAccount, participantBlurb: a.participantBlurb, organizerBlurb: a.organizerBlurb, roles: { organizador: a.organizer, participante: a.participant },
      fullName: a.fullName, email: a.email, password: a.password, passwordHint: a.passwordHint, create: a.create, checkEmail: a.checkEmail, resend: a.resend, resent: a.resent,
      acceptPrefix: g.acceptPrefix, and: g.and, terms: g.terms, privacy: g.privacy, termsHref: `/${lang}/terminos`, privacyHref: `/${lang}/privacidad`,
      errors: { terms: g.acceptError, exists: a.errorExists, password: a.errorPassword, generic: a.errorGeneric },
    }} />
  );
}

export default function Registro(props: PageProps<"/[lang]/registro">) {
  return <Suspense fallback={<PageSkeleton />}><Page props={props} /></Suspense>;
}
