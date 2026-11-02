import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { events, ropers, fmtDate, mxn } from "@/lib/mock";
import { RoperCard } from "@/components/RoperCard";

async function EventoInner({ params }: { params: PageProps<"/eventos/[id]">["params"] }) {
  const { id } = await params;
  const e = events.find((x) => x.id === id);
  if (!e) notFound();
  const inscritos = ropers.filter((r) => e.registered.includes(r.id));
  const open = e.status === "publicado" && e.registered.length < e.capacity;
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_340px]">
      <div>
        <p className="font-mono text-xs uppercase text-brand-hot">{fmtDate(e.date)} · {e.city}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">{e.name}</h1>
        <p className="mt-1 text-muted">{e.venue} · Organiza {e.organizer}</p>
        <p className="mt-5 max-w-2xl">{e.description}</p>
        <h2 className="mt-10 font-display text-xl font-bold">Inscritos ({inscritos.length}/{e.capacity})</h2>
        <div className="mt-4 space-y-3">
          {inscritos.length ? inscritos.map((r) => <RoperCard key={r.id} r={r} />) : <p className="text-muted">Aún no hay inscritos.</p>}
        </div>
      </div>
      <aside className="h-fit rounded-2xl bg-ink p-6 text-cream">
        <h2 className="font-display text-lg font-bold">Inscripción</h2>
        <ul className="mt-4 space-y-2">
          {e.categories.map((c) => <li key={c.name} className="flex justify-between border-b border-white/10 pb-2 text-sm"><span>{c.name}</span><span className="font-mono">{mxn(c.fee)}</span></li>)}
        </ul>
        {open
          ? <Link href={`/eventos/${e.id}/inscribirse`} className="mt-5 block rounded-full bg-brand py-3 text-center font-semibold text-ink hover:bg-brand-hot">Inscribirme</Link>
          : <p className="mt-5 rounded-xl bg-white/10 p-3 text-center text-sm">{e.status === "finalizado" ? "Evento finalizado" : "Cupo lleno"}</p>}
        <p className="mt-3 text-center text-xs text-cream/60">Necesitas una cuenta de participante para inscribirte.</p>
      </aside>
    </div>
  );
}

export default function Evento(props: PageProps<"/eventos/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <EventoInner params={props.params} />
    </Suspense>
  );
}
