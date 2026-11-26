// Estado y visibilidad de los eventos (KIN-769). Son DOS propiedades distintas; el contrato completo está en docs/EVENTOS_ESTADOS.md.
//  * `status` (ciclo de vida): borrador -> publicado -> finalizado.
//  * `visibility` (visibilidad): público (por defecto) o privado.
// La regla de quién ve qué vive en la base (public.can_view_event y las políticas de lectura); esto solo da los tipos y valores a quien los consuma (H03, H04, H08, H13).
// Sin dependencias, para poder probarlo con `node --test`.

export const EVENT_STATUSES = ["borrador", "publicado", "finalizado"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_VISIBILITIES = ["publico", "privado"] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];
export const DEFAULT_VISIBILITY: EventVisibility = "publico";

/** Lee una visibilidad que viene de fuera (base, formulario, API). Lo que no se reconoce es público: es el valor por defecto de todos los eventos. */
export const parseVisibility = (value: unknown): EventVisibility => (value === "privado" ? "privado" : DEFAULT_VISIBILITY);

export const isPrivate = (e: { visibility?: string | null }) => parseVisibility(e.visibility) === "privado";

/**
 * Transiciones válidas del estado (lo que hoy permiten la web y la app):
 *  - borrador <-> publicado: el organizador, desde la web (para publicar se exige ciudad, lugar, cupo y categorías: event-publish.ts).
 *  - publicado -> finalizado: al cerrar los resultados desde la app, o por fecha (se calcula al leer con statusByDate / public.event_phase).
 *  - finalizado -> nada: reabrir los resultados desde la app no cambia el estado (sigue finalizado).
 */
export const NEXT_STATUSES: Record<EventStatus, readonly EventStatus[]> = {
  borrador: ["publicado"],
  publicado: ["borrador", "finalizado"],
  finalizado: [],
};

export const canTransition = (from: EventStatus, to: EventStatus) => NEXT_STATUSES[from].includes(to);
