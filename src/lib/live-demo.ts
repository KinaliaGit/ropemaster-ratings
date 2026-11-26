// Datos INVENTADOS para diseñar la pantalla en vivo (KIN-558). Solo se usan en desarrollo (LIVE_DEMO), nunca en producción.
import type { LiveSnapshot, LiveTeam } from "./live.ts";

const FIRST = ["Diego", "Pablo", "Hugo", "Julián", "Luis", "Andrés", "Marco", "Saúl", "Fabián", "Sergio", "Víctor"];
const LAST = ["Mora", "Cano", "Lara", "Pérez", "Soto", "Vega", "Ibarra", "Núñez", "Gil", "Ríos", "Paz", "Ruiz", "Díaz"];
const TOTAL = 90;
const ROPERS = 61;

// 61 lazadores para 90 equipos: cada quien tiene varios turnos, como en una competencia real.
const person = (i: number) => `${FIRST[(i % ROPERS) % FIRST.length]} ${LAST[(i % ROPERS) % LAST.length]}`;
const team = (n: number): LiveTeam => ({ n, header: person(2 * n), heeler: person(2 * n + 1), totalMs: 7000 + ((n * 7919) % 9000) });

/** La foto de la ronda cuando ya pasaron `done` equipos. */
export function demoSnapshot(done: number, now: number): LiveSnapshot {
  const passed = Math.min(Math.max(done, 0), TOTAL);
  const at = (n: number) => (n <= TOTAL ? team(n) : null);
  return {
    name: "Roping de ejemplo", venue: "Las Tunas", round: 2, rounds: 3, total: TOTAL, done: passed,
    current: at(passed + 1),
    pending: Array.from({ length: Math.max(TOTAL - passed - 1, 0) }, (_, i) => team(passed + 2 + i)),
    standings: Array.from({ length: passed }, (_, i) => team(i + 1)).sort((a, b) => a.totalMs! - b.totalMs!),
    updatedAt: new Date(now).toISOString(),
  };
}
