// Reducción de fotos EN EL NAVEGADOR antes de subirlas: baja el peso, y al volver a codificar como JPEG
// se pierden los metadatos EXIF (que pueden traer la ubicación de la foto).

function blobFrom(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", quality));
}

// Recorte cuadrado centrado (foto de perfil).
export async function toSquareJpeg(file: File, side: number, maxBytes: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, side, side);
  bmp.close();
  return shrink(canvas, maxBytes);
}

// Mantiene la proporción y limita el lado largo (fotos de evento).
export async function toLimitedJpeg(file: File, maxSide: number, maxBytes: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return shrink(canvas, maxBytes);
}

// Baja la calidad por pasos hasta que quepa en el tope.
async function shrink(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  let blob = await blobFrom(canvas, 0.85);
  for (const q of [0.75, 0.65, 0.55, 0.45]) {
    if (blob.size <= maxBytes) break;
    blob = await blobFrom(canvas, q);
  }
  return blob;
}
