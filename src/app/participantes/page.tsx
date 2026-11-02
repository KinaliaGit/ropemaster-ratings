import { Suspense } from "react";
import { ropers } from "@/lib/mock";
import { RoperCard } from "@/components/RoperCard";

async function Lista({ searchParams }: { searchParams: PageProps<"/participantes">["searchParams"] }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const list = ropers.filter((r) => r.name.toLowerCase().includes(q)).sort((a, b) => b.rating - a.rating);
  return (
    <>
      <form className="mt-6 flex max-w-lg gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre" className="flex-1 rounded-full border border-line bg-white px-5 py-2.5 text-sm outline-none focus:border-ink" />
        <button className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hot">Buscar</button>
      </form>
      <div className="mt-6 border-t border-line">
        {list.length ? list.map((r, i) => <RoperCard key={r.id} r={r} rank={q ? undefined : i + 1} />) : <p className="text-muted">Sin resultados para “{q}”.</p>}
      </div>
    </>
  );
}

export default function Participantes(props: PageProps<"/participantes">) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">Participantes</h1>
      <p className="mt-3 text-lg text-muted">Lazadores y barrileras con su rating e historial. Público, sin necesidad de cuenta.</p>
      <Suspense fallback={<p className="mt-6 text-muted">Cargando…</p>}>
        <Lista searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
