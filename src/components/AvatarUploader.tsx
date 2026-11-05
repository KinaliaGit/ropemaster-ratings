"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setAvatar, deleteAvatar } from "@/lib/avatar-actions";
import { AVATAR_SIDE, MAX_AVATAR_BYTES, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { toSquareJpeg } from "@/lib/resize-image";
import type { PhotoError } from "@/lib/storage";

type Labels = { add: string; change: string; remove: string; saving: string; tooBig: string; error: string };

// Foto de perfil: recorte cuadrado y reducción en el navegador, y subida a Supabase Storage por una acción del servidor.
export function AvatarUploader({ url, initials, name, l }: { url: string | null; initials: string; name: string; l: Labels }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null | undefined>(undefined); // undefined = usar la del servidor
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"tooBig" | "error" | null>(null);
  const shown = preview === undefined ? url : preview;

  function fail(e: PhotoError | "client") { setError(e === "too_big" ? "tooBig" : "error"); }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return fail("too_big");
    if (!file.type.startsWith("image/")) return fail("invalid");
    setBusy(true);
    try {
      const blob = await toSquareJpeg(file, AVATAR_SIDE, MAX_AVATAR_BYTES);
      const fd = new FormData();
      fd.set("file", blob, "foto.jpg");
      const res = await setAvatar(fd);
      if (!res.ok) fail(res.error);
      else { setPreview(URL.createObjectURL(blob)); router.refresh(); }
    } catch { fail("client"); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function onRemove() {
    setBusy(true); setError(null);
    const res = await deleteAvatar();
    setBusy(false);
    if (res.ok) { setPreview(null); router.refresh(); } else fail(res.error);
  }

  return (
    <div className="flex w-fit flex-col items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={shown ? l.change : l.add}
        className="group relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-ink text-xl font-semibold text-white transition hover:ring-2 hover:ring-ink hover:ring-offset-2 disabled:opacity-60">
        {shown
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={shown} alt={name} className="size-full object-cover" />
          : <span aria-hidden>{initials}</span>}
      </button>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:border-ink disabled:opacity-60">{busy ? l.saving : shown ? l.change : l.add}</button>
        {shown && <button type="button" onClick={onRemove} disabled={busy} className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:text-ink disabled:opacity-60">{l.remove}</button>}
      </div>
      {error && <p role="alert" className="max-w-[14rem] text-center text-xs text-red-700">{error === "tooBig" ? l.tooBig : l.error}</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPick(e.target.files?.[0])} />
    </div>
  );
}
