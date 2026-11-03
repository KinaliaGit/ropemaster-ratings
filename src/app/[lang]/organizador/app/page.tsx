import { Suspense } from "react";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { getDictionary, resolveLang } from "@/lib/i18n";
import { siteUrl } from "@/lib/stripe";

async function Page({ params }: { params: PageProps<"/[lang]/organizador/app">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const a = t.org.app;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/app`}>
      {() => (
        <>
          <OrgNav lang={lang} t={t} />
          <div className="mx-auto max-w-3xl px-5 pb-10 pt-8">
            <h1 className="text-3xl font-semibold">{a.title}</h1>
            <p className="mt-2 text-muted">{a.blurb}</p>
            <ol className="mt-6 space-y-3 text-sm">
              {a.steps.map((s, i) => (
                <li key={s} className="card flex items-center gap-3 p-4"><span className="grid size-7 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</span>{s}</li>
              ))}
            </ol>
            <div className="card mt-6 p-5">
              <p className="label">{a.token}</p>
              {/* TODO: generar un token por organizador (guardar solo su hash en api_tokens) y mostrarlo una sola vez. */}
              <p className="mt-2 rounded-lg bg-sand p-3 text-sm">{a.tokenNote}</p>
              <p className="label mt-4">{a.endpoints}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 text-xs text-white">{`GET ${siteUrl}/api/app/eventos
GET ${siteUrl}/api/app/participantes
Authorization: Bearer <token>`}</pre>
            </div>
          </div>
        </>
      )}
    </Gate>
  );
}

export default function ConexionApp(props: PageProps<"/[lang]/organizador/app">) {
  return <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">…</p>}><Page params={props.params} /></Suspense>;
}
