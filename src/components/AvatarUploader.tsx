"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setAvatar, deleteAvatar } from "@/lib/avatar-actions";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";

type Labels = { add: string; change: string; remove: string; saving: string; tooBig: string; error: string };

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
  const [error, setError] = useState<"tooBig" | "error" | null>(null);
  const shown = preview === undefined ? url : preview;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) { setError("tooBig"); return; }
    if (!file.type.startsWith("image/")) { setError("error"); return; }
    setBusy(true);
    try {
      const dataUrl = await toSquareJpeg(file);
      const res = await setAvatar(dataUrl);
      if (!res.ok) throw new Error("rejected");
      setPreview(dataUrl);
      router.refresh();
    } catch { setError("error"); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function onRemove() {
    setBusy(true); setError(null);
    const res = await deleteAvatar();
    setBusy(false);
    if (res.ok) { setPreview(null); router.refresh(); } else setError("error");
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
