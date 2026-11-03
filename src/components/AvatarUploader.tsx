"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setAvatar, deleteAvatar } from "@/lib/avatar-actions";

type Labels = { add: string; change: string; remove: string; saving: string; hint: string; error: string };

const SIZE = 256;

// Recorta la imagen a un cuadrado centrado y la reduce a 256 px (JPEG) antes de enviarla: ligera y sin metadatos.
async function toSquareJpeg(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bmp.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function AvatarUploader({ url, initials, name, l }: { url: string | null; initials: string; name: string; l: Labels }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null | undefined>(undefined); // undefined = usar la del servidor
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const shown = preview === undefined ? url : preview;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(false);
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) { setError(true); return; }
    setBusy(true);
    try {
      const dataUrl = await toSquareJpeg(file);
      const res = await setAvatar(dataUrl);
      if (!res.ok) throw new Error("rejected");
      setPreview(dataUrl);
      router.refresh();
    } catch { setError(true); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function onRemove() {
    setBusy(true); setError(false);
    const res = await deleteAvatar();
    setBusy(false);
    if (res.ok) { setPreview(null); router.refresh(); } else setError(true);
  }

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={shown ? l.change : l.add}
        className="group relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-sand text-xl font-semibold transition hover:ring-2 hover:ring-ink disabled:opacity-60">
        {shown
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={shown} alt={name} className="size-full object-cover" />
          : <span aria-hidden>{initials}</span>}
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{busy ? l.saving : shown ? l.change : l.add}</span>
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded-full border border-line px-4 py-1.5 text-sm font-medium transition hover:border-ink disabled:opacity-60">{busy ? l.saving : shown ? l.change : l.add}</button>
          {shown && <button type="button" onClick={onRemove} disabled={busy} className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:text-ink disabled:opacity-60">{l.remove}</button>}
        </div>
        <p className="mt-1.5 text-xs text-muted">{l.hint}</p>
        {error && <p role="alert" className="mt-1 text-xs text-red-700">{l.error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onPick(e.target.files?.[0])} />
    </div>
  );
}
