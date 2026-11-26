// Esqueletos de la portada y del ranking (KIN-611): respetan el tamaño de lo que reemplazan para que nada salte al cargar.

// Buscador, pestañas y cuadrícula de carteles 2:3 de la portada (lo que depende de los eventos).
export function EventsSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mt-4 h-12 rounded-full bg-sand sm:max-w-lg" />
      <div className="mt-3 h-12 rounded-full bg-sand/70 sm:max-w-sm" />
      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="aspect-[2/3] rounded-[20px] bg-sand sm:rounded-[24px]" />
            <div className="mt-2 space-y-2 px-1"><div className="h-4 w-3/4 rounded bg-sand" /><div className="h-3 w-1/2 rounded bg-sand/70" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Buscador y filas del ranking (lo que depende de la primera página).
export function RankingSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mt-4 h-12 rounded-full bg-sand" />
      <div className="card mt-4 divide-y divide-line px-3">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="flex h-14 items-center gap-3"><span className="size-9 rounded-full bg-sand" /><span className="h-4 w-40 rounded bg-sand" /></div>)}
      </div>
    </div>
  );
}
