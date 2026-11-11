// Esqueletos de la página de un evento: respetan el tamaño de lo que reemplazan para que nada salte al cargar (KIN-611 y KIN-612).

// Lista de inscritos (lo que depende de la lista).
export function EnrolledSkeleton() {
  return (
    <div className="mt-2 animate-pulse" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line py-4 sm:px-2">
          <span className="size-10 rounded-full bg-sand" />
          <div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-sand" /><div className="h-3 w-28 rounded bg-sand/70" /></div>
          <span className="h-7 w-10 rounded bg-sand" />
        </div>
      ))}
    </div>
  );
}

// Página completa mientras llega el evento: cartel 2:3 a la izquierda y los datos a la derecha.
export function EventSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-5 pb-12 pt-8" aria-hidden>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-12">
        <div className="mx-auto aspect-[2/3] w-full max-w-sm rounded-[28px] bg-sand lg:max-w-none" />
        <div>
          <div className="h-10 w-3/4 rounded-xl bg-sand" />
          <div className="mt-3 h-5 w-1/2 rounded-lg bg-sand/70" />
          <div className="mt-6 h-56 rounded-2xl bg-sand/60" />
          <div className="mt-12 h-6 w-40 rounded bg-sand" />
        </div>
      </div>
    </div>
  );
}
