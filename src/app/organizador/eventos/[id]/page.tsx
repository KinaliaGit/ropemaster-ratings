import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { GateSession } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { PhotoUploader } from "@/components/PhotoUploader";
import { events, ropers, fmtDate, mxn } from "@/lib/mock";

async function Resolver({ params }: { params: PageProps<"/organizador/eventos/[id]">["params"] }) {
  const { id } = await params;
  return (
    <GateSession role="organizador" next={`/organizador/eventos/${id}`}>
      {(s) => {
        const e = events.find((x) => x.id === id);
        // Un organizador solo gestiona sus propios eventos.
        if (!e || e.organizer !== s.id) notFound();
        const rows = e.registered.map((rid) => ({ r: ropers.find((x) => x.id === rid)!, paid: !e.unpaid?.includes(rid) }));
        return (
          <>
            <OrgNav />
            <div className="mx-auto max-w-6xl px-5 py-10">
              <Link href="/organizador" className="text-sm text-muted hover:underline">← Mis eventos</Link>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-semibold">{e.name}</h1>
                  <p className="text-muted">{fmtDate(e.date)} · {e.venue}, {e.city}</p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/eventos/${e.id}`} className="rounded-full bg-sand px-4 py-2 text-sm font-semibold hover:bg-line">Ver página pública</Link>
                  {/* TODO: server actions que cambian events.status en Supabase. */}
                  <button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hot">{e.status === "borrador" ? "Publicar" : "Pasar a borrador"}</button>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="card p-4"><p className="text-2xl font-semibold">{e.registered.length}/{e.capacity}</p><p className="label">Inscritos</p></div>
                <div className="card p-4"><p className="text-2xl font-semibold">{rows.filter((x) => x.paid).length}</p><p className="label">Pagados</p></div>
                <div className="card p-4"><p className="text-2xl font-semibold capitalize">{e.status}</p><p className="label">Estado · disponible en la app al sincronizar</p></div>
              </div>
              <div className="card mt-8 p-6"><PhotoUploader /></div>
              <h2 className="mt-8 text-xl font-semibold">Inscritos</h2>
              <div className="mt-3 overflow-x-auto card">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sand label"><tr><th className="p-3">Participante</th><th>Celular</th><th>Rating</th><th>Categoría</th><th>Pago</th></tr></thead>
                  <tbody>
                    {rows.map(({ r, paid }) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="p-3 font-semibold"><Link href={`/participantes/${r.id}`} className="hover:text-brand-hot">{r.name}</Link></td>
                        <td className="font-mono">{r.phone}</td><td className="font-mono">{r.rating}</td><td>{e.categories[0].name}</td>
                        <td className={`font-semibold ${paid ? "text-brand-hot" : "text-red-700"}`}>{paid ? `Pagado ${mxn(e.categories[0].fee)}` : "Pendiente"}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-muted">Aún no hay inscritos.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      }}
    </GateSession>
  );
}

export default function GestionarEvento(props: PageProps<"/organizador/eventos/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <Resolver params={props.params} />
    </Suspense>
  );
}
