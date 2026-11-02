import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { events, mxn } from "@/lib/mock";
import { PayButton } from "@/components/PayButton";

async function InscribirseInner({ params }: { params: PageProps<"/eventos/[id]/inscribirse">["params"] }) {
  const { id } = await params;
  const e = events.find((x) => x.id === id);
  if (!e) notFound();
  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <Link href={`/eventos/${e.id}`} className="text-sm text-muted hover:underline">← {e.name}</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Inscripción</h1>
      <form className="mt-6 space-y-5 rounded-2xl border border-line bg-white p-6">
        <fieldset>
          <legend className="text-sm font-semibold">Categoría</legend>
          {e.categories.map((c, i) => (
            <label key={c.name} className="mt-2 flex cursor-pointer items-center justify-between rounded-xl border border-line p-3 has-checked:border-brand has-checked:bg-brand-soft">
              <span><input type="radio" name="cat" defaultChecked={i === 0} className="mr-2 accent-brand" />{c.name}</span>
              <span className="font-mono text-sm">{mxn(c.fee)}</span>
            </label>
          ))}
        </fieldset>
        {e.disciplines.length > 1 && (
          <fieldset>
            <legend className="text-sm font-semibold">Disciplina</legend>
            {e.disciplines.map((d) => <label key={d} className="mr-4 text-sm"><input type="checkbox" defaultChecked className="mr-1 accent-brand" />{d}</label>)}
          </fieldset>
        )}
        <PayButton eventId={e.id} />
        <p className="text-center text-xs text-muted">El pago se procesa de forma segura con Stripe.</p>
      </form>
      <p className="mt-4 text-center text-sm text-muted">¿Sin cuenta? <Link href="/registro" className="font-semibold text-brand-hot underline">Crea una</Link> o <Link href="/entrar" className="font-semibold text-brand-hot underline">inicia sesión</Link>.</p>
    </div>
  );
}

export default function Inscribirse(props: PageProps<"/eventos/[id]/inscribirse">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <InscribirseInner params={props.params} />
    </Suspense>
  );
}
