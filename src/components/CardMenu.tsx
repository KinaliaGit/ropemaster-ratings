"use client";
import { useEffect, useRef } from "react";

// «⋯» de las tarjetas de «Mi cuenta» y del panel: un <details> (funciona con teclado y sin esperar a que cargue el JavaScript) cuyo contenido FLOTA debajo del botón en lugar de
// empujar hacia abajo el resto de la tarjeta. Se cierra al tocar fuera, con Escape o al abrir otro menú (solo hay uno abierto a la vez).
export function CardMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => { if (ref.current) ref.current.open = false; };
    const onPointer = (e: PointerEvent) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !ref.current?.open) return;
      close();
      ref.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <details ref={ref} className="group">
      <summary aria-label={label} className="absolute -right-1 -top-1 grid size-11 cursor-pointer list-none place-items-center rounded-full text-lg leading-none hover:bg-sand group-open:bg-sand [&::-webkit-details-marker]:hidden">⋯</summary>
      <div className="absolute right-0 top-11 z-20 w-[min(19rem,calc(100vw-3.5rem))] space-y-3 rounded-xl border border-line bg-white p-3 text-sm shadow-[0_12px_32px_-12px_rgba(20,19,17,0.35)]">{children}</div>
    </details>
  );
}
