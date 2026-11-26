"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setAvatar, deleteAvatar } from "@/lib/avatar-actions";
import { AVATAR_SIDE, MAX_AVATAR_BYTES, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { toSquareJpeg } from "@/lib/resize-image";
import type { PhotoError } from "@/lib/storage";

type Labels = { add: string; change: string; remove: string; saving: string; tooBig: string; error: string };

// Foto de perfil: recorte cuadrado y reducción en el navegador, y subida a Supabase Storage por una acción del servidor.
export function AvatarUploader({ url, initials, name, l, compact = false, badge }: { url: string | null; initials: string; name: string; l: Labels; compact?: boolean; badge?: React.ReactNode }) {
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
    <div className={`flex w-fit flex-col items-center ${compact ? (badge ? "gap-2.5" : "gap-1") : "gap-3"}`}>
      <div className="relative">
        <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={shown ? l.change : l.add}
          className={`group relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink font-semibold text-white transition hover:ring-2 hover:ring-ink hover:ring-offset-2 disabled:opacity-60 ${compact ? "size-14 text-base" : "size-20 text-xl"}`}>
          {shown
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={shown} alt={name} className="size-full object-cover" />
            : <span aria-hidden>{initials}</span>}
        </button>
        {badge && <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2">{badge}</span>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {/* Compacto: la foto misma es el botón para ponerla o cambiarla; debajo solo queda el aviso de guardado o «Quitar». */}
        {compact ? busy && <span className="text-xs text-muted">{l.saving}</span> : <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:border-ink disabled:opacity-60">{busy ? l.saving : shown ? l.change : l.add}</button>}
        {shown && !(compact && busy) && <button type="button" onClick={onRemove} disabled={busy} className={`rounded-full text-muted transition hover:text-ink disabled:opacity-60 ${compact ? "px-2 py-2 text-xs" : "px-3 py-1.5 text-sm"}`}>{l.remove}</button>}
      </div>
      {error && <p role="alert" className="max-w-[14rem] text-center text-xs text-red-700">{error === "tooBig" ? l.tooBig : l.error}</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPick(e.target.files?.[0])} />
    </div>
  );
}
