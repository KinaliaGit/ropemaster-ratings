// Reglas de la campana de avisos (el menú del encabezado). Puro, para poder probarlo.

/** El circulito de la campana: de 1 a 9 el número, y «9+» si hay más. */
export const badgeText = (unread: number) => (unread > 9 ? "9+" : String(unread));

/**
 * Lo que dice la campana mientras la base responde a «marcar como leído»: a los sin ver se les resta lo que la persona ya marcó aquí (sin bajar de 0), y
 * «ver todos» sale siempre que haya más avisos de los que caben en el menú.
 */
export function bellState({ unread, total, shown, markedHere }: { unread: number; total: number; shown: number; markedHere: number }) {
  return { unread: Math.max(0, unread - markedHere), hasMore: total > shown };
}
