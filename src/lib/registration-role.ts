// Cambiar el rol de una inscripción desde la web: a qué rol se puede pasar y si se debe ofrecer el botón. Sin dependencias, para probarlo con `node --test`
// (tests/registration-role.test.mjs). La base (`change_registration_role`, 0066) sigue siendo la que decide: esto solo evita ofrecer un botón que seguro fallaría.

export type Side = "header" | "heeler";
export type RoleRoom = { header: boolean; heeler: boolean };
type RoleReg = { id: string; category: string; role: string | null };

const isSide = (v: unknown): v is Side => v === "header" || v === "heeler";
export const otherSide = (s: Side): Side => (s === "header" ? "heeler" : "header");

/**
 * El rol al que se puede pasar `reg`, o null si no se debe ofrecer el cambio. Se ofrece cuando:
 *  - las inscripciones siguen abiertas (`open`: evento publicado y sin cierre) y la inscripción tiene un rol guardado (sin rol no hay «el otro»);
 *  - no tiene ya, en esa misma categoría, otra inscripción con el rol de destino o sin rol (quien se inscribió con «los dos»: la base respondería `already`);
 *  - el lado de destino tiene lugar. `room` es lo que dijo `events_role_room`; si no hay dato (la consulta falló) se ofrece y la base decide.
 * `siblings` son las inscripciones de la MISMA persona en el MISMO evento (incluida `reg`).
 */
export function roleSwitchTarget(reg: RoleReg, siblings: RoleReg[], room: RoleRoom | undefined, open: boolean): Side | null {
  if (!open || !isSide(reg.role)) return null;
  const to = otherSide(reg.role);
  if (siblings.some((o) => o.id !== reg.id && o.category === reg.category && (o.role === null || o.role === to))) return null;
  if (room && room[to] === false) return null;
  return to;
}
