import Link from "next/link";
import { events, ropers, fmtDate } from "@/lib/mock";
import { EventCard } from "@/components/EventCard";

export default function Eventos() {
  const open = events.filter((e) => e.status === "publicado").sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.status === "finalizado");
  const next = open[0];
  const stats = [
    ["Eventos abiertos", open.length, "con inscripciones"],
    ["Inscritos", events.reduce((n, e) => n + e.registered.length, 0), "en todos los eventos"],
    ["Participantes", ropers.length, "con perfil global"],
    ["Mejor rating", Math.max(...ropers.map((r) => r.rating)), "en el ranking"],
  ];
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-6">
      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <section className="hero-card flex min-h-[320px] flex-col justify-between p-8 sm:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/hero-roping.png" alt="" className="pointer-events-none absolute -right-6 bottom-0 h-[115%] opacity-[0.16] brightness-0 invert" />
          <div className="relative">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-white/80">Próximo evento</p>
            <h1 className="mt-3 max-w-md font-display text-4xl font-extrabold uppercase leading-[1.05] sm:text-5xl">{next?.name ?? "Sin eventos por ahora."}</h1>
            {next && <p className="mt-3 text-lg text-white/90">{next.venue} · {next.city} · {fmtDate(next.date)}</p>}
          </div>
          {next && <Link href={`/eventos/${next.id}`} className="relative mt-8 w-fit rounded-full bg-[#fff6e8] px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-ink transition hover:bg-white">Ver evento</Link>}
        </section>
        <div className="grid grid-cols-2 gap-5">
          {stats.map(([l, v, d]) => (
            <div key={l} className="card flex flex-col justify-between p-5">
              <p className="label">{l}</p>
              <p className="my-2 font-display text-5xl font-bold leading-none">{v}</p>
              <p className="text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mt-12 font-display text-3xl font-bold">Próximos eventos</h2>
      <p className="mt-1 text-muted">Consulta los eventos e inscríbete con tu cuenta. Los ratings y resultados son públicos.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{open.map((e) => <EventCard key={e.id} e={e} />)}</div>
      {past.length > 0 && (<>
        <h2 className="mt-12 font-display text-3xl font-bold">Finalizados</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{past.map((e) => <EventCard key={e.id} e={e} />)}</div>
      </>)}
    </div>
  );
}
