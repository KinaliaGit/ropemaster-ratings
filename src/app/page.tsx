import { events, ropers } from "@/lib/mock";
import { EventCard } from "@/components/EventCard";

export default function Eventos() {
  const open = events.filter((e) => e.status === "publicado").sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.status === "finalizado");
  const stats = [
    [open.length, "eventos abiertos"],
    [events.reduce((n, e) => n + e.registered.length, 0), "inscritos"],
    [ropers.length, "participantes"],
  ];
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <h1 className="text-4xl font-semibold sm:text-5xl">Eventos</h1>
      <p className="mt-3 max-w-xl text-lg text-muted">Encuentra tu próximo evento, inscríbete y sigue tu rating.</p>
      <dl className="mt-8 flex gap-8 border-y border-line py-5">
        {stats.map(([n, l]) => (
          <div key={l}><dd className="text-2xl font-semibold tabular-nums">{n}</dd><dt className="text-sm text-muted">{l}</dt></div>
        ))}
      </dl>

      <h2 className="mt-12 text-xl font-semibold">Próximos</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{open.map((e) => <EventCard key={e.id} e={e} />)}</div>
      {past.length > 0 && (<>
        <h2 className="mt-14 text-xl font-semibold">Finalizados</h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} />)}</div>
      </>)}
    </div>
  );
}
