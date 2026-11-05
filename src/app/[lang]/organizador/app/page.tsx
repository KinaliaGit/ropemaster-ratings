import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Gate } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { ConnectionCode } from "@/components/ConnectionCode";
import { getDictionary, resolveLang } from "@/lib/i18n";
import { activeSyncToken } from "@/lib/sync-tokens";
import { fmtDate, type Lang } from "@/lib/format";

// Tarjeta del código de conexión: lee de la base cuándo se creó y cuándo se usó por última vez.
async function CodeSection({ organizer, lang }: { organizer: string; lang: Lang }) {
  const a = getDictionary(lang).org.app;
  const active = await activeSyncToken(organizer).catch(() => null);
  const details = active
    ? `${a.code.since} ${fmtDate(active.createdAt.slice(0, 10), lang)}. ${a.code.lastUsed}: ${active.lastUsedAt ? fmtDate(active.lastUsedAt.slice(0, 10), lang) : a.code.neverUsed}.`
    : a.code.none;
  return (
    <section className="card mt-8 p-6" aria-labelledby="code-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="code-title" className="text-lg font-semibold">{a.code.title}</h2>
          <p className="mt-1 text-sm text-muted">{details}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-brand-soft text-brand-hot" : "bg-sand text-muted"}`}>{active ? a.code.connected : a.code.notConnected}</span>
      </div>
      <div className="mt-5">
        <ConnectionCode hasActive={!!active} l={{
          generate: a.code.generate, regenerate: a.code.regenerate, copy: a.code.copy, copied: a.code.copied, shownOnce: a.code.shownOnce,
          replaceNote: a.code.replaceNote, error: a.code.error, revoke: a.code.revoke, revokeConfirm: a.code.revokeConfirm, revokeError: a.code.revokeError,
        }} />
      </div>
    </section>
  );
}

async function Page({ params }: { params: PageProps<"/[lang]/organizador/app">["params"] }) {
  const lang = await resolveLang(params);
  const t = getDictionary(lang);
  const a = t.org.app;
  return (
    <Gate lang={lang} role="organizador" next={`/${lang}/organizador/app`}>
      {(s) => (
        <>
          <OrgNav lang={lang} t={t} admin={s.isAdmin} />
          <div className="mx-auto max-w-2xl px-5 pb-10 pt-10">
            <h1 className="text-3xl font-semibold">{a.title}</h1>
            <p className="mt-2 text-muted">{a.blurb}</p>

            <ol className="mt-8 space-y-4">
              {a.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <CodeSection organizer={s.id} lang={lang} />
          </div>
        </>
      )}
    </Gate>
  );
}

export default function ConexionApp(props: PageProps<"/[lang]/organizador/app">) {
  return <Suspense fallback={<PageSkeleton />}><Page params={props.params} /></Suspense>;
}
