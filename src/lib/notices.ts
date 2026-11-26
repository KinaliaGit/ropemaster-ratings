// Reglas del aviso en la web (KIN-657): cuándo se ve el texto de arriba y cuándo «cae» un aviso nuevo. Puro, para poder probarlo.
// `latest` es la fecha del aviso sin leer más reciente; `seen`, la del último que la persona ya vio en la página de Avisos.

export type Unread = { count: number; latest: string | null };

/** El evento que avisa a la página que cambió lo «visto» en este navegador y la llave donde se guarda (por cuenta). Lo comparten el banner y la campana. */
export const NOTICES_CHANGED = "rm-avisos";
export const seenKeyFor = (userId: string) => `rm-avisos-vistos:${userId}`;

/** ¿`latest` es posterior a `previous`? Sin `previous`, cualquier aviso cuenta como nuevo. */
export function isNewer(latest: string | null, previous: string | null): boolean {
  if (!latest) return false;
  return !previous || Date.parse(latest) > Date.parse(previous);
}

/** El texto se ve solo mientras haya algo sin leer que todavía no se haya visto; el circulito de la campana no depende de esto. */
export const showBanner = (u: Unread, seen: string | null) => u.count > 0 && isNewer(u.latest, seen);
