// Esqueleto que se muestra al instante mientras llega el contenido, para que la pantalla nunca quede en blanco.
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-5 pb-10 pt-12" aria-hidden>
      <div className="h-11 w-64 rounded-xl bg-sand" />
      <div className="mt-4 h-5 w-96 max-w-full rounded-lg bg-sand/70" />
      <div className="mt-10 space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-sand/60" />)}
      </div>
    </div>
  );
}
