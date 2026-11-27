// Fotos que se eligen al CREAR un evento (todavía no existe el evento, así que se guardan en el navegador y se suben justo después de crearlo).
// La primera foto es la portada: el servidor la toma como portada al subir la primera. Sin dependencias para probarlo con `node --test` (ver tests/photo-drafts.test.mjs).

/** Pone la foto con ese id al principio (será la portada) y deja las demás en su orden. Un id que no existe no cambia nada. */
export function moveToFront<T extends { id: string }>(list: readonly T[], id: string): T[] {
  const found = list.find((item) => item.id === id);
  return found ? [found, ...list.filter((item) => item.id !== id)] : [...list];
}
