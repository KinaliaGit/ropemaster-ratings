import Link from "next/link";
import { Suspense } from "react";
import { GateSession } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { StripeConnectButton } from "@/components/StripeConnectButton";
import { events, fmtDate, mxn } from "@/lib/mock";

const badge: Record<string, string> = { publicado: "bg-brand-soft text-brand-hot", borrador: "bg-sand text-muted", finalizado: "bg-ink text-cream" };

export default function Panel() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <GateSession role="organizador" next="/organizador">
        {(s) => {
          const mine = events.filter((e) => e.organizer === s.id);
          const inscritos = mine.reduce((n, e) => n + e.registered.length, 0);
          const ingresos = mine.reduce((n, e) => n + e.registered.filter((r) => !e.unpaid?.includes(r)).length * e.categories[0].fee, 0);
          const stats = [["Eventos", mine.length], ["Inscritos", inscritos], ["Cobrado", mxn(ingresos)]];
          return (
            <>
              <OrgNav />
              <div className="mx-auto max-w-6xl px-5 py-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="label text-brand-hot">Cuenta de organizador</p>
                    <h1 className="text-3xl font-semibold">{s.name}</h1>
                  </div>
                  <Link href="/organizador/eventos/nuevo" className="rounded-full bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-hot">+ Nuevo evento</Link>
                </div>
                <dl className="mt-6 grid gap-3 sm:grid-cols-3">
                  {stats.map(([l, v]) => <div key={l} className="card p-4"><dd className="text-3xl font-semibold">{v}</dd><dt className="label">{l}</dt></div>)}
                </dl>
                <StripeConnectButton />
                <h2 className="mt-8 text-xl font-semibold">Mis eventos</h2>
                <div className="mt-3 overflow-x-auto card">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-sand label"><tr><th className="p-3">Evento</th><th>Fecha</th><th>Estado</th><th>Inscritos</th><th></th></tr></thead>
                    <tbody>
                      {mine.map((e) => (
                        <tr key={e.id} className="border-t border-line">
                          <td className="p-3 font-semibold">{e.name}</td>
                          <td className="font-mono">{fmtDate(e.date)}</td>
                          <td><span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase ${badge[e.status]}`}>{e.status}</span></td>
                          <td className="font-mono">{e.registered.length}/{e.capacity}</td>
                          <td className="pr-3 text-right"><Link href={`/organizador/eventos/${e.id}`} className="font-semibold text-brand-hot hover:underline">Gestionar →</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        }}
      </GateSession>
    </Suspense>
  );
}
