import Link from "next/link";
import { LEGAL, type LegalDoc } from "@/lib/legal";

// Documento legal: título, versión y secciones. Enlaza al otro documento al final.
export function LegalPage({ doc, otherHref, otherLabel }: { doc: LegalDoc; otherHref: string; otherLabel: string }) {
  return (
    <article className="mx-auto max-w-2xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {doc.updated}: {LEGAL.version}
        {LEGAL.draft && <span className="ml-2 rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium">{doc.draft}</span>}
      </p>
      <div className="mt-8 space-y-8">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold">{s.h}</h2>
            {s.p.map((para) => <p key={para} className="mt-2 leading-relaxed text-ink/85">{para}</p>)}
          </section>
        ))}
      </div>
      <p className="mt-10 border-t border-line pt-6 text-sm"><Link href={otherHref} className="font-medium text-brand-hot underline">{otherLabel}</Link></p>
    </article>
  );
}
