import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ropers } from "@/lib/mock";

async function PerfilInner({ params }: { params: PageProps<"/participantes/[id]">["params"] }) {
  const { id } = await params;
  const r = ropers.find((x) => x.id === id);
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-12">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid size-20 place-items-center rounded-full bg-sand text-2xl font-semibold">{r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
        <div className="flex-1">
          <h1 className="text-4xl font-semibold">{r.name}</h1>
          <p className="text-muted">{r.verified ? "Perfil verificado ✓" : "Perfil sin reclamar"}</p>
        </div>
        <div className="text-right"><p className="text-6xl font-semibold leading-none tabular-nums">{r.rating}</p><p className="label mt-2">Rating</p></div>
      </div>
      <dl className="mt-8 grid grid-cols-3 border-y border-line py-5 text-center">
        {[[r.events, "eventos"], [r.wins, "victorias"], [r.results.length, "resultados"]].map(([n, l]) => <div key={l}><dd className="text-2xl font-semibold tabular-nums">{n}</dd><dt className="text-sm text-muted">{l}</dt></div>)}
      </dl>

      <h2 className="mt-10 text-xl font-semibold">Historial de eventos</h2>
      {r.results.length === 0 ? <p className="mt-3 text-muted">Aún no hay resultados registrados.</p> : (
        <div className="mt-4 overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="bg-sand label text-muted"><tr><th className="p-3">Evento</th><th>Fecha</th><th>Disciplina</th><th>Tiempo</th><th>Lugar</th></tr></thead>
            <tbody>
              {r.results.map((x) => (
                <tr key={x.event + x.date} className="border-t border-line">
                  <td className="p-3 font-semibold">{x.event}{x.verified && <span className="ml-1 text-brand" title="Evento verificado">✓</span>}</td>
                  <td className="font-mono">{x.date}</td><td>{x.discipline}</td><td className="font-mono">{x.time}</td><td className="font-mono">#{x.place}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 text-xs text-muted">Los datos de contacto no son públicos. ¿No eres tú o es un error? <a href="/registro" className="underline">Reportar</a>.</p>
    </div>
  );
}

export default function Perfil(props: PageProps<"/participantes/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-4xl px-5 pb-10 pt-12 text-muted">Cargando…</p>}>
      <PerfilInner params={props.params} />
    </Suspense>
  );
}
