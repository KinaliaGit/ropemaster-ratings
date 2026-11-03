import { Suspense } from "react";
import { RegistroForm } from "./RegistroForm";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Page({ params }: { params: PageProps<"/[lang]/registro">["params"] }) {
  const lang = await resolveLang(params);
  const a = getDictionary(lang).auth;
  return <RegistroForm lang={lang} l={{ title: a.createAccount, participant: a.participant, organizer: a.organizer, participantBlurb: a.participantBlurb, organizerBlurb: a.organizerBlurb, fullName: a.fullName, phone: a.phone, email: a.email, sendCode: a.sendCode, create: a.create, code: a.code, verify: a.verify, demoNote: a.demoNote, continue: a.continue }} />;
}

export default function Registro(props: PageProps<"/[lang]/registro">) {
  return <Suspense fallback={null}><Page params={props.params} /></Suspense>;
}
