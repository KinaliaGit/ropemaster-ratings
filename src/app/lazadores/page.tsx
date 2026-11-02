import { Suspense } from "react";
import { ropers } from "@/lib/mock";
import { RoperCard } from "@/components/RoperCard";

async function Lista({ searchParams }: { searchParams: PageProps<"/lazadores">["searchParams"] }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const list = ropers.filter((r) => r.name.toLowerCase().includes(q)).sort((a, b) => b.rating - a.rating);
  return (
    <>
      <form className="mt-6 flex gap-3">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre" className="flex-1 rounded-full border border-line bg-white px-5 py-3" />
        <button className="rounded-full bg-brand px-6 py-3 font-semibold text-ink hover:bg-brand-hot">Buscar</button>
      </form>
      <div className="mt-6 space-y-3">
        {list.length ? list.map((r) => <RoperCard key={r.id} r={r} />) : <p className="text-muted">Sin resultados para “{q}”.</p>}
      </div>
    </>
  );
}

export default function Lazadores(props: PageProps<"/lazadores">) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="font-display text-3xl font-extrabold">Lazadores</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Cargando…</p>}>
        <Lista searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
