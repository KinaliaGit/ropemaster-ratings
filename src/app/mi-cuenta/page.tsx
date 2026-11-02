import Link from "next/link";
import { Suspense } from "react";
import { GateSession } from "@/components/Gate";
import { EventCard } from "@/components/EventCard";
import { RoperCard } from "@/components/RoperCard";
import { events, ropers, fmtDate, mxn, initials } from "@/lib/mock";

export default function MiCuenta() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <GateSession role="participante" next="/mi-cuenta">
        {(s) => {
          const me = ropers.find((r) => r.id === s.id)!;
          const mine = events.filter((e) => e.registered.includes(me.id));
          const available = events.filter((e) => e.status === "publicado" && !e.registered.includes(me.id));
          const top = [...ropers].sort((a, b) => b.rating - a.rating).slice(0, 4);
          return (
            <div className="mx-auto max-w-6xl px-5 pb-10 pt-10">
              <div className="flex flex-wrap items-center gap-5">
                <div className="grid size-16 place-items-center rounded-full bg-sand text-xl font-semibold">{initials(me.name)}</div>
                <div className="flex-1">
                  <p className="label">Cuenta de participante</p>
                  <h1 className="text-3xl font-semibold">{me.name}</h1>
                  <p className="text-sm text-muted">{me.phone} · {me.verified ? "celular verificado ✓" : "celular sin verificar"}</p>
                </div>
                <dl className="flex gap-8">
                  {[["Rating", me.rating], ["Eventos", me.events], ["Victorias", me.wins]].map(([l, v]) => (
                    <div key={l}><dd className="text-3xl font-semibold tabular-nums">{v}</dd><dt className="label">{l}</dt></div>
                  ))}
                </dl>
              </div>

              <h2 className="mt-12 text-xl font-semibold">Mis inscripciones</h2>
              <div className="mt-3 space-y-3">
                {mine.length === 0 && <p className="text-muted">Aún no te has inscrito a ningún evento.</p>}
                {mine.map((e) => {
                  const paid = !e.unpaid?.includes(me.id);
                  return (
                    <Link key={e.id} href={`/eventos/${e.id}`} className="card card-link flex items-center justify-between p-4">
                      <span><span className="font-semibold">{e.name}</span><span className="block font-mono text-xs text-muted">{fmtDate(e.date)} · {e.city}</span></span>
                      <span className="text-right text-sm"><span className="block font-mono">{mxn(e.categories[0].fee)}</span>
                        <span className={`text-xs font-semibold ${paid ? "text-brand-hot" : "text-red-700"}`}>{paid ? "Pagado ✓" : "Pago pendiente"}</span></span>
                    </Link>
                  );
                })}
              </div>

              <h2 className="mt-12 text-xl font-semibold">Eventos disponibles</h2>
              <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {available.length ? available.map((e) => <EventCard key={e.id} e={e} />) : <p className="text-muted">No hay eventos nuevos por ahora.</p>}
              </div>

              <div className="mt-10 flex items-end justify-between">
                <h2 className="text-xl font-semibold">Ranking</h2>
                <Link href="/participantes" className="text-sm font-semibold text-brand-hot hover:underline">Ver todos →</Link>
              </div>
              <div className="mt-2">{top.map((r, i) => <RoperCard key={r.id} r={r} rank={i + 1} />)}</div>
              <p className="mt-6 text-sm"><Link href={`/participantes/${me.id}`} className="font-semibold text-brand-hot underline">Ver mi perfil público e historial</Link></p>
            </div>
          );
        }}
      </GateSession>
    </Suspense>
  );
}
