// Cola real de subida de fotos del navegador (KIN-774): un solo objeto para toda la sesión, así la subida sigue aunque la persona cambie de pantalla.
// Solo se importa desde componentes de cliente. La lógica está en photo-queue.ts.
import { addEventPhoto } from "@/lib/photo-actions";
import { createUploadQueue } from "@/lib/photo-queue";

export const photoUploads = createUploadQueue(async (slug, blob) => {
  const fd = new FormData();
  fd.set("event", slug);
  fd.set("file", blob, "foto.jpg");
  const res = await addEventPhoto(fd);
  return res.ok;
});
