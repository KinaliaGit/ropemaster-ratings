import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { events } from "@/lib/mock";
import { mxn, type Lang } from "@/lib/format";
import { Gate } from "@/components/Gate";
import { PayButton } from "@/components/PayButton";
import { getDictionary, resolveLang } from "@/lib/i18n";

async function Resolver({ params }: { params: PageProps<"/[lang]/eventos/[id]/inscribirse">["params"] }) {
  const lang: Lang = await resolveLang(params);
  const { id } = await params;
  const t = getDictionary(lang);
  const e = events.find((x) => x.id === id);
  if (!e) notFound();
  return (
    <Gate lang={lang} role="participante" next={`/${lang}/eventos/${id}/inscribirse`}>
      {() => (
        <div className="mx-auto max-w-lg px-5 pb-10 pt-12">
          <Link href={`/${lang}/eventos/${e.id}`} className="text-sm text-muted hover:text-ink">← {e.name}</Link>
          <h1 className="mt-3 text-3xl font-semibold">{t.enroll.title}</h1>
          <form className="card mt-6 space-y-5 p-6">
            <fieldset>
              <legend className="text-sm font-medium">{t.enroll.category}</legend>
              {e.categories.map((c, i) => (
                <label key={c.name} className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-line p-3 has-checked:border-ink has-checked:bg-sand">
                  <span><input type="radio" name="cat" value={c.name} defaultChecked={i === 0} className="mr-2 accent-brand" />{c.name}</span>
                  <span className="text-sm tabular-nums">{mxn(c.fee, lang)}</span>
                </label>
              ))}
            </fieldset>
            {e.disciplines.length > 1 && (
              <fieldset>
                <legend className="text-sm font-medium">{t.enroll.discipline}</legend>
                {e.disciplines.map((d) => <label key={d} className="mr-4 text-sm"><input type="checkbox" defaultChecked className="mr-1 accent-brand" />{t.disc[d as "lazo"].label}</label>)}
              </fieldset>
            )}
            <PayButton eventId={e.id} lang={lang} label={t.enroll.pay} busyLabel={t.enroll.paying} errors={t.enroll.errors} />
            <p className="text-center text-xs text-muted">{t.enroll.secure}</p>
          </form>
        </div>
      )}
    </Gate>
  );
}

export default function Inscribirse(props: PageProps<"/[lang]/eventos/[id]/inscribirse">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">…</p>}>
      <Resolver params={props.params} />
    </Suspense>
  );
}
