"use client";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import Image from "next/image";
import { EVENT_PHOTO_SIDE, MAX_EVENT_PHOTO_BYTES, MAX_EVENT_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { toLimitedJpeg } from "@/lib/resize-image";
import { moveToFront } from "@/lib/photo-drafts";

export type PhotoDraft = { id: string; blob: Blob; url: string };
export type PhotoDraftLabels = { add: string; hint: string; cover: string; makeCover: string; remove: string; uploading: string; tooBig: string; invalid: string; limit: string };

// Fotos y portada al crear el evento: se eligen aquí, se reducen en el navegador (como en la página del evento) y se suben justo después de crear el evento.
// La primera es la portada; «Hacer portada» mueve una foto al principio. Las fotos viven en el formulario (no aquí) para no perderse si el servidor rechaza el envío.
export function EventPhotoDrafts({ photos, setPhotos, labels: l, disabled }: { photos: PhotoDraft[]; setPhotos: Dispatch<SetStateAction<PhotoDraft[]>>; labels: PhotoDraftLabels; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const problems = new Set<string>();
    const added: PhotoDraft[] = [];
    let room = MAX_EVENT_PHOTOS - photos.length;
    for (const file of Array.from(files)) {
      if (room <= 0) { problems.add(l.limit); break; }
      if (file.size > MAX_UPLOAD_BYTES) { problems.add(l.tooBig); continue; }
      if (!file.type.startsWith("image/")) { problems.add(l.invalid); continue; }
      try {
        const blob = await toLimitedJpeg(file, EVENT_PHOTO_SIDE, MAX_EVENT_PHOTO_BYTES);
        added.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) });
        room--;
      } catch { problems.add(l.invalid); } // el navegador no pudo leerlo como imagen
    }
    setPhotos((p) => [...p, ...added]);
    setNotes([...problems]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  function remove(id: string) {
    const gone = photos.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setPhotos((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div data-testid="photo-drafts">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-sand">
            <Image src={p.url} alt="" fill unoptimized sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" className="object-cover" />
            {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-0.5 text-[11px] font-medium text-white">{l.cover}</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/55 p-2 text-[11px] font-medium text-white">
              {i !== 0 ? <button type="button" disabled={disabled} onClick={() => setPhotos((list) => moveToFront(list, p.id))} className="min-h-8 rounded-full bg-white/20 px-2.5 hover:bg-white/35 disabled:opacity-50">{l.makeCover}</button> : <span />}
              <button type="button" disabled={disabled} onClick={() => remove(p.id)} className="min-h-8 rounded-full bg-white/20 px-2.5 hover:bg-red-600/80 disabled:opacity-50">{l.remove}</button>
            </div>
          </li>
        ))}
        {photos.length < MAX_EVENT_PHOTOS && (
          <li>
            <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-[#cfcbc1] text-sm text-muted transition hover:border-ink disabled:opacity-60">
              <span className="text-center"><span className="block text-2xl leading-none">+</span>{busy ? l.uploading : l.add}</span>
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onPick(e.target.files)} />
      <p className="mt-2 text-xs text-muted">{l.hint}</p>
      {notes.map((n) => <p key={n} role="alert" className="mt-1 text-xs text-red-700">{n}</p>)}
    </div>
  );
}
