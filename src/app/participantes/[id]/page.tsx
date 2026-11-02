import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ropers } from "@/lib/mock";

async function PerfilInner({ params }: { params: PageProps<"/participantes/[id]">["params"] }) {
  const { id } = await params;
  const r = ropers.find((x) => x.id === id);
  if (!r) notFound();
  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <div className="hero-card flex flex-wrap items-center gap-5 p-6 sm:p-8">
        <div className="grid size-20 place-items-center rounded-full bg-white/90 font-display text-2xl font-extrabold text-brand-hot">
          {r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl font-extrabold">{r.name}</h1>
          <p className="text-sm text-white/85">{r.verified ? "Perfil verificado ✓" : "Perfil sin reclamar"} · {r.events} eventos · {r.wins} victorias</p>
        </div>
        <div className="text-right"><p className="font-display text-6xl font-extrabold leading-none text-white">{r.rating}</p><p className="label mt-2 !text-white/80">Rating</p></div>
      </div>

      <h2 className="mt-10 font-display text-xl font-bold">Historial de eventos</h2>
      {r.results.length === 0 ? <p className="mt-3 text-muted">Aún no hay resultados registrados.</p> : (
        <div className="mt-4 overflow-x-auto card">
          <table className="w-full text-left text-sm">
            <thead className="bg-sand font-mono text-xs uppercase text-muted"><tr><th className="p-3">Evento</th><th>Fecha</th><th>Disciplina</th><th>Tiempo</th><th>Lugar</th></tr></thead>
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
    <Suspense fallback={<p className="mx-auto max-w-4xl px-5 py-12 text-muted">Cargando…</p>}>
      <PerfilInner params={props.params} />
    </Suspense>
  );
}
