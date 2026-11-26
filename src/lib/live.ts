// KIN-558: lo que necesita la pantalla de un evento en vivo. Es la PROPUESTA de datos para la sincronización (KIN-782, KIN-786 y KIN-787):
// hoy la app todavía no manda turnos ni avance, así que la pantalla solo se alimenta con datos de ejemplo. Puro, para poder probarlo.
/** Un equipo en la ronda: `n` es su número de turno; `totalMs`, su tiempo acumulado (null si aún no tiene). */
export type LiveTeam = { n: number; header: string; heeler: string; totalMs: number | null };

export type LiveSnapshot = {
  name: string;
  venue: string;
  round: number;
  rounds: number;
  /** Equipos de la ronda y cuántos ya pasaron. */
  total: number;
  done: number;
  /** Quien está lazando; null antes de empezar y al terminar la ronda. */
  current: LiveTeam | null;
  /** TODOS los que faltan, en orden de turno: cada quien necesita ver sus turnos, aunque estén lejos. */
  pending: LiveTeam[];
  /** Los que ya pasaron, de la mejor posición a la peor (sin tiempo, al final), como las calcula quien manda los datos: la web no las reordena. */
  standings: LiveTeam[];
  updatedAt: string;
};

export const progressPct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0);

export type LiveMatch = { team: LiveTeam } & ({ state: "current" } | { state: "pending"; ahead: number } | { state: "placed"; place: number });

/**
 * Los turnos de alguien, en orden de turno: por nombre, o por número si solo se escriben cifras. `ahead` es cuántos turnos faltan para el suyo.
 * `matches` son las reglas de búsqueda de la web.
 */
export function findTeams(s: LiveSnapshot, query: string, matches: (name: string, query: string) => boolean): LiveMatch[] {
  const q = query.trim();
  if (!q) return [];
  const turn = /^\d+$/.test(q) ? Number(q) : null;
  const hit = (t: LiveTeam) => (turn === null ? matches(`${t.header} ${t.heeler}`, q) : t.n === turn);
  return [
    ...(s.current && hit(s.current) ? [{ team: s.current, state: "current" as const }] : []),
    ...s.pending.flatMap((team, i) => (hit(team) ? [{ team, state: "pending" as const, ahead: i + 1 }] : [])),
    ...s.standings.flatMap((team, i) => (hit(team) ? [{ team, state: "placed" as const, place: i + 1 }] : [])),
  ].sort((a, b) => a.team.n - b.team.n);
}
