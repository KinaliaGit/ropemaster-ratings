"use client";
import { useRef, useState } from "react";

// Selector de fotos con vista previa. La primera es la portada.
// TODO: subir a Supabase Storage (bucket event-photos) y guardar en event_photos al conectar la base de datos.
export function PhotoUploader({ label = "Fotos del evento", single = false }: { label?: string; single?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  function pick(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024).map((f) => URL.createObjectURL(f));
    setPreviews((p) => (single ? next.slice(0, 1) : [...p, ...next]));
  }

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {previews.map((src, i) => (
          <div key={src} className="relative aspect-square overflow-hidden rounded-2xl bg-sand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="size-full object-cover" />
            {i === 0 && !single && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Portada</span>}
          </div>
        ))}
        <button type="button" onClick={() => input.current?.click()} className="grid aspect-square place-items-center rounded-2xl border border-dashed border-[#cfcbc1] text-sm text-muted transition hover:border-ink hover:text-ink">
          <span className="text-center"><span className="block text-2xl leading-none">+</span>Agregar</span>
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple={!single} hidden onChange={(e) => pick(e.target.files)} />
      <p className="mt-2 text-xs text-muted">JPG o PNG, hasta 10 MB cada una.</p>
    </div>
  );
}
