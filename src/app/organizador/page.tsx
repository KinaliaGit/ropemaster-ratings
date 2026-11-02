import Link from "next/link";
import { events, fmtDate } from "@/lib/mock";

export default function Panel() {
  // TODO: filtrar por el organizador autenticado.
  const mine = events.filter((e) => e.organizer === "Rodeo Norte");
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Panel del organizador</h1>
          <p className="mt-1 text-muted">Crea, publica y administra tus eventos.</p>
        </div>
        <Link href="/organizador/eventos/nuevo" className="rounded-full bg-brand px-5 py-3 font-semibold text-ink hover:bg-brand-hot">+ Nuevo evento</Link>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand font-mono text-xs uppercase text-muted"><tr><th className="p-3">Evento</th><th>Fecha</th><th>Estado</th><th>Inscritos</th></tr></thead>
          <tbody>
            {mine.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="p-3 font-semibold"><Link href={`/eventos/${e.id}`} className="hover:text-brand-hot">{e.name}</Link></td>
                <td className="font-mono">{fmtDate(e.date)}</td>
                <td className="capitalize">{e.status}</td>
                <td className="font-mono">{e.registered.length}/{e.capacity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
