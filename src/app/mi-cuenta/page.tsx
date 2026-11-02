import Link from "next/link";
import { events, ropers, fmtDate, mxn } from "@/lib/mock";

export default function MiCuenta() {
  // TODO: usar el participante autenticado.
  const me = ropers[0];
  const mine = events.filter((e) => e.registered.includes(me.id));
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <h1 className="font-display text-3xl font-extrabold">Mi cuenta</h1>
      <p className="mt-1 text-muted">{me.name} · rating <span className="font-mono font-semibold">{me.rating}</span> · <Link href={`/participantes/${me.id}`} className="underline">ver mi perfil público</Link></p>
      <h2 className="mt-8 font-display text-xl font-bold">Mis inscripciones</h2>
      <div className="mt-3 space-y-3">
        {mine.map((e) => (
          <Link key={e.id} href={`/eventos/${e.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-white p-4 hover:border-brand">
            <span><span className="font-semibold">{e.name}</span><span className="block font-mono text-xs text-muted">{fmtDate(e.date)} · {e.city}</span></span>
            <span className="text-right text-sm"><span className="block font-mono">{mxn(e.categories[0].fee)}</span><span className="text-xs font-semibold text-brand-hot">Pagado ✓</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
