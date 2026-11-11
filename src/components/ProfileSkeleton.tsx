// Esqueletos del perfil: respetan el tamaño de lo que reemplazan para que nada salte al cargar (KIN-611).

// Totales y tabla del historial (lo que depende de los resultados).
export function HistorySkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mt-8 grid grid-cols-2 gap-y-4 border-y border-line py-5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="mx-auto space-y-2 text-center"><div className="mx-auto h-7 w-12 rounded bg-sand" /><div className="mx-auto h-3 w-20 rounded bg-sand/70" /></div>)}
      </div>
      <div className="mt-10 h-6 w-56 rounded bg-sand" />
      <div className="mt-4 space-y-px overflow-hidden rounded-2xl border border-line">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-sand/50" />)}
      </div>
    </div>
  );
}

// Perfil completo mientras llega el participante.
export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse px-5 pb-10 pt-12" aria-hidden>
      <div className="flex flex-wrap items-center gap-5">
        <div className="size-20 rounded-full bg-sand" />
        <div className="h-10 flex-1 rounded-xl bg-sand" />
        <div className="h-16 w-28 rounded-xl bg-sand" />
      </div>
      <HistorySkeleton />
    </div>
  );
}
