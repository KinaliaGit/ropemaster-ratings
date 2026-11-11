"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { addEventPhoto, deleteEventPhoto, setEventCover } from "@/lib/photo-actions";
import { EVENT_PHOTO_SIDE, MAX_EVENT_PHOTO_BYTES, MAX_EVENT_PHOTOS, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { toLimitedJpeg } from "@/lib/resize-image";
import type { PhotoError } from "@/lib/storage";

type Labels = {
  title: string; add: string; hint: string; cover: string; makeCover: string; remove: string; confirmRemove: string;
  uploading: string; empty: string; tooBig: string; invalid: string; limit: string; failed: string;
};

// Fotos del evento: la primera es la portada; se pueden agregar varias, cambiar la portada y eliminar.
export function EventPhotos({ eventSlug, photos, coverUrl, l }: { eventSlug: string; photos: { id: string; url: string }[]; coverUrl: string | null; l: Labels }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null); // "subiendo" o el id de la foto en proceso
  const [notes, setNotes] = useState<string[]>([]);

  const say = (e: PhotoError | "client") => ({ too_big: l.tooBig, invalid: l.invalid, limit: l.limit }[e as string] ?? l.failed);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    const problems = new Set<string>();
    setBusy("uploading");
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) { problems.add(l.tooBig); continue; }
      if (!file.type.startsWith("image/")) { problems.add(l.invalid); continue; }
      let blob: Blob;
      try { blob = await toLimitedJpeg(file, EVENT_PHOTO_SIDE, MAX_EVENT_PHOTO_BYTES); }
      catch { problems.add(l.invalid); continue; } // el navegador no pudo leerlo como imagen
      try {
        const fd = new FormData();
        fd.set("event", eventSlug);
        fd.set("file", blob, "foto.jpg");
        const res = await addEventPhoto(fd);
        if (!res.ok) { problems.add(say(res.error)); if (res.error === "limit") break; }
      } catch { problems.add(l.failed); }
    }
    setNotes([...problems]);
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  async function run(id: string, op: () => Promise<{ ok: boolean; error?: PhotoError }>) {
    setBusy(id);
    const res = await op();
    setNotes(res.ok ? [] : [say(res.error ?? "failed")]);
    setBusy(null);
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm font-medium">{l.title} <span className="font-normal text-muted">{photos.length}/{MAX_EVENT_PHOTOS}</span></p>
      {photos.length === 0 && <p className="mt-2 text-sm text-muted">{l.empty}</p>}
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => {
          const isCover = p.url === coverUrl;
          const working = busy === p.id;
          return (
            <li key={p.id} className={`relative aspect-square overflow-hidden rounded-2xl bg-sand ${working ? "opacity-60" : ""}`}>
              <Image src={p.url} alt="" fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" className="object-cover" />
              {isCover && <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-0.5 text-[11px] font-medium text-white">{l.cover}</span>}
              <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-[11px] font-medium text-white">
                {!isCover ? <button type="button" disabled={!!busy} onClick={() => run(p.id, () => setEventCover(eventSlug, p.id))} className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur hover:bg-white/35 disabled:opacity-50">{l.makeCover}</button> : <span />}
                <button type="button" disabled={!!busy} onClick={() => confirm(l.confirmRemove) && run(p.id, () => deleteEventPhoto(eventSlug, p.id))} className="rounded-full bg-white/20 px-2.5 py-1 backdrop-blur hover:bg-red-600/80 disabled:opacity-50">{l.remove}</button>
              </div>
            </li>
          );
        })}
        {photos.length < MAX_EVENT_PHOTOS && (
          <li>
            <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-[#cfcbc1] text-sm text-muted transition hover:border-ink hover:text-ink disabled:opacity-60">
              <span className="text-center"><span className="block text-2xl leading-none">+</span>{busy === "uploading" ? l.uploading : l.add}</span>
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
