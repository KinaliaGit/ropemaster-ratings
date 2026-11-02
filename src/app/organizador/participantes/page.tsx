import Link from "next/link";
import { Suspense } from "react";
import { GateSession } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { ropers } from "@/lib/mock";

export default function ParticipantesOrg() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <GateSession role="organizador" next="/organizador/participantes">
        {() => (
          <>
            <OrgNav />
            <div className="mx-auto max-w-6xl px-5 py-10">
              <h1 className="font-display text-3xl font-extrabold">Participantes</h1>
              <p className="mt-1 text-sm text-muted">Directorio global con datos de contacto, visible solo para organizadores. Úsalo para registrar participantes en tus eventos.</p>
              <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-sand font-mono text-xs uppercase text-muted"><tr><th className="p-3">Nombre</th><th>Celular</th><th>Rating</th><th>Eventos</th><th>Victorias</th><th>Perfil</th></tr></thead>
                  <tbody>
                    {[...ropers].sort((a, b) => b.rating - a.rating).map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="p-3 font-semibold"><Link href={`/participantes/${r.id}`} className="hover:text-brand-hot">{r.name}</Link></td>
                        <td className="font-mono">{r.phone}</td><td className="font-mono">{r.rating}</td><td className="font-mono">{r.events}</td><td className="font-mono">{r.wins}</td>
                        <td>{r.verified ? "Verificado ✓" : "Sin reclamar"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </GateSession>
    </Suspense>
  );
}
