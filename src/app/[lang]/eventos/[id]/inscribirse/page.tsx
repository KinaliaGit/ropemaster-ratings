import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/PageSkeleton";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/lib/data/events";
import { mxn, type Lang } from "@/lib/format";
import { Gate } from "@/components/Gate";
import { enroll } from "@/lib/registration-actions";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Resolver({ props }: { props: PageProps<"/[lang]/eventos/[id]/inscribirse"> }) {
  const lang: Lang = await resolveLang(props.params);
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = getDictionary(lang);
  const e = await getPublicEvent(id);
  if (!e) notFound();
  return (
    <Gate lang={lang} role="participante" next={`/${lang}/eventos/${id}/inscribirse`}>
      {() => (
        <div className="mx-auto max-w-lg px-5 pb-10 pt-12">
          <Link href={`/${lang}/eventos/${e.id}`} className="text-sm text-muted hover:text-ink">← {e.name}</Link>
          <h1 className="mt-3 text-3xl font-semibold">{t.enroll.title}</h1>
          {typeof sp.error === "string" && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{(t.enroll.errors as Record<string, string>)[sp.error] ?? t.enroll.errors.failed}</p>}
          <form action={enroll} className="card mt-6 space-y-5 p-6">
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="event" value={e.id} />
            <fieldset>
              <legend className="text-sm font-medium">{t.enroll.category}</legend>
              {e.categories.map((c, i) => (
                <label key={c.name} className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-line p-3 has-checked:border-ink has-checked:bg-sand">
                  <span><input type="radio" name="category" value={c.id} defaultChecked={i === 0} className="mr-2 accent-brand" />{c.name}</span>
                  <span className="text-sm tabular-nums">{mxn(c.fee, lang)}</span>
                </label>
              ))}
            </fieldset>
            <button className="w-full rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hot">{t.enroll.submit}</button>
            <p className="text-center text-xs text-muted">{t.enroll.pendingNote}</p>
          </form>
        </div>
      )}
    </Gate>
  );
}

export default function Inscribirse(props: PageProps<"/[lang]/eventos/[id]/inscribirse">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Resolver props={props} />
    </Suspense>
  );
}
