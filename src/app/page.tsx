import Link from "next/link";
import { ropers } from "@/lib/mock";
import { RoperCard } from "@/components/RoperCard";

const stats = [
  ["1 perfil", "global por lazador"],
  ["0%", "dependencia de señal en el evento"],
  ["100%", "historial en un solo lugar"],
];

export default function Home() {
  const top = [...ropers].sort((a, b) => b.rating - a.rating);
  return (
    <>
      <section className="bg-ink text-cream">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <p className="font-mono text-xs uppercase tracking-widest text-brand">Registro global de lazadores</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-6xl">
            Tu rating te sigue a <span className="text-brand">cada arena</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-cream/75">
            Consulta el rating y el historial de cualquier lazador antes de entrar a un evento. Los resultados capturados en Rope Master se sincronizan aquí, incluso si el evento fue sin una sola barra de señal.
          </p>
          <form action="/lazadores" className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
            <input name="q" placeholder="Busca por nombre de lazador" className="flex-1 rounded-full bg-cream px-5 py-3 text-ink placeholder:text-muted" />
            <button className="rounded-full bg-brand px-6 py-3 font-semibold text-ink hover:bg-brand-hot">Buscar</button>
          </form>
          <dl className="mt-12 grid gap-6 sm:grid-cols-3">
            {stats.map(([n, l]) => (
              <div key={l}><dt className="font-display text-3xl font-extrabold text-brand">{n}</dt><dd className="text-sm text-cream/70">{l}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Mejores ratings</h2>
          <Link href="/lazadores" className="text-sm font-semibold text-brand-hot hover:underline">Ver todos →</Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {top.map((r, i) => <RoperCard key={r.id} r={r} rank={i + 1} />)}
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">¿Eres lazador? Reclama tu perfil.</h2>
            <p className="mt-3 text-muted">Los organizadores ya te registraron con tu celular. Verifícalo con un código y ve todo tu historial.</p>
            <Link href="/reclamar" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 font-semibold text-cream hover:bg-ink-soft">Reclamar mi perfil</Link>
          </div>
          <ol className="space-y-3 font-mono text-sm">
            {["Escribe tu celular", "Recibe un código por SMS o WhatsApp", "Listo: tu historial y rating son tuyos"].map((t, i) => (
              <li key={t} className="flex items-center gap-3 rounded-xl bg-white p-4"><span className="grid size-7 place-items-center rounded-full bg-brand font-bold text-ink">{i + 1}</span>{t}</li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
