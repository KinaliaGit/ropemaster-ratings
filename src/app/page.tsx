import { events } from "@/lib/mock";
import { EventCard } from "@/components/EventCard";

export default function Eventos() {
  const open = events.filter((e) => e.status === "publicado");
  const past = events.filter((e) => e.status === "finalizado");
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Eventos</h1>
      <p className="mt-2 text-muted">Consulta los eventos publicados e inscríbete. Para ver ratings y resultados no necesitas cuenta.</p>
      <h2 className="mt-8 font-mono text-xs uppercase tracking-widest text-brand-hot">Próximos</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{open.map((e) => <EventCard key={e.id} e={e} />)}</div>
      {past.length > 0 && (<>
        <h2 className="mt-10 font-mono text-xs uppercase tracking-widest text-muted">Finalizados</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} />)}</div>
      </>)}
    </div>
  );
}
