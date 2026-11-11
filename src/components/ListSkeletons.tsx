// Esqueletos de la portada y del ranking (KIN-611): respetan el tamaño de lo que reemplazan para que nada salte al cargar.

const GRID = "grid grid-cols-1 gap-x-4 gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

// Cifras y cuadrícula de carteles 2:3 de la portada (lo que depende de los eventos).
export function EventsSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mt-8 flex gap-8 border-y border-line py-5">
        {[0, 1].map((i) => <div key={i} className="space-y-2"><div className="h-7 w-10 rounded bg-sand" /><div className="h-3 w-24 rounded bg-sand/70" /></div>)}
      </div>
      <div className="mt-12 h-6 w-48 rounded bg-sand" />
      <div className={`mt-5 ${GRID}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="aspect-[2/3] rounded-[24px] bg-sand" />
            <div className="mt-3 space-y-2 px-1"><div className="h-4 w-3/4 rounded bg-sand" /><div className="h-3 w-1/2 rounded bg-sand/70" /></div>
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
      <div className="mt-6 h-11 max-w-lg rounded-full bg-sand" />
      <div className="mt-6 border-t border-line">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line py-4 sm:px-2">
            <span className="h-4 w-6 rounded bg-sand" />
            <span className="size-10 rounded-full bg-sand" />
            <div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-sand" /><div className="h-3 w-28 rounded bg-sand/70" /></div>
            <span className="h-7 w-10 rounded bg-sand" />
          </div>
        ))}
      </div>
    </div>
  );
}
