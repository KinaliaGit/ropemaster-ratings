"use client";
import { useRef, useState } from "react";

import { MAX_UPLOAD_BYTES } from "@/lib/limits";

type Labels = { title: string; add: string; hint: string; cover: string; tooBig: string };

// Selector de fotos con vista previa. La primera es la portada.
// TODO: subir a Supabase Storage (bucket event-photos) y guardar en event_photos al conectar la base de datos.
export function PhotoUploader({ labels, single = false }: { labels: Labels; single?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [rejected, setRejected] = useState(false);

  function pick(files: FileList | null) {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const ok = images.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    setRejected(ok.length < images.length);
    const next = ok.map((f) => URL.createObjectURL(f));
    setPreviews((p) => (single ? next.slice(0, 1) : [...p, ...next]));
  }

  return (
    <div>
      <p className="text-sm font-medium">{labels.title}</p>
      <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {previews.map((src, i) => (
          <div key={src} className="relative aspect-square overflow-hidden rounded-2xl bg-sand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="size-full object-cover" />
            {i === 0 && !single && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">{labels.cover}</span>}
          </div>
        ))}
        <button type="button" onClick={() => input.current?.click()} className="grid aspect-square place-items-center rounded-2xl border border-dashed border-[#cfcbc1] text-sm text-muted transition hover:border-ink hover:text-ink">
          <span className="text-center"><span className="block text-2xl leading-none">+</span>{labels.add}</span>
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple={!single} hidden onChange={(e) => pick(e.target.files)} />
      <p className="mt-2 text-xs text-muted">{labels.hint}</p>
      {rejected && <p role="alert" className="mt-1 text-xs text-red-700">{labels.tooBig}</p>}
    </div>
  );
}
