// Fecha límite de inscripción (KIN-626): se captura como fecha y hora LOCALES del evento (con su zona horaria IANA) y se guarda como un instante.
// Sin dependencias: usa Intl para pasar de un lado a otro.

export const DEFAULT_TIMEZONE = "America/Mexico_City";

// Zonas que se ofrecen al organizador (México y las de uso común en rodeos de la región). La base acepta cualquier zona IANA válida.
export const TIMEZONES = [
  "America/Mexico_City", "America/Monterrey", "America/Chihuahua", "America/Mazatlan", "America/Hermosillo", "America/Tijuana", "America/Cancun",
  "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/New_York",
] as const;

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

const parts = (ms: number, tz: string) => {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
};

// Desfase (ms) de la zona respecto a UTC en ese instante.
function offsetAt(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// "2026-12-05T18:00" en la zona del evento -> el instante (ISO UTC). null si el texto o la zona no son válidos.
export function zonedLocalToIso(local: string, tz: string): string | null {
  const m = LOCAL.exec(local);
  if (!m || !isValidTimezone(tz)) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null; // 31 de febrero, 25:00…
  let t = asUtc - offsetAt(asUtc, tz);
  const again = offsetAt(t, tz);
  if (again !== asUtc - t) t = asUtc - again; // cruzó un cambio de horario
  return new Date(t).toISOString();
}

// Un instante -> "YYYY-MM-DDTHH:mm" en la zona del evento (para el campo del formulario).
export function isoToZonedLocal(iso: string, tz: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms) || !isValidTimezone(tz)) return "";
  const p = parts(ms, tz);
  const z = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${z(p.year, 4)}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

// Fecha (YYYY-MM-DD) de ese instante en la zona del evento.
export const zonedDateOf = (iso: string, tz: string) => isoToZonedLocal(iso, tz).slice(0, 10);

// ¿La fecha de cierre cae después del día del evento? El evento solo tiene fecha (sin hora), así que se permite cerrar el mismo día.
export const closesAfterEvent = (closesIso: string, eventDate: string, tz: string) => zonedDateOf(closesIso, tz) > eventDate;

// KIN-656: un evento cuya fecha ya pasó (en SU zona horaria; el mismo día todavía cuenta) se considera finalizado aunque nadie lo haya cerrado.
// Se calcula al leer, sin tarea programada, para que nunca quede desfasado; los eventos cerrados a mano o con resultados ya vienen "finalizado".
export const todayIn = (tz: string, now: number = Date.now()) => zonedDateOf(new Date(now).toISOString(), tz);
export const hasEventPassed = (e: { date: string; timezone: string }, now: number = Date.now()) => !!e.date && e.date < todayIn(e.timezone, now);
export function statusByDate<S extends string>(e: { status: S; date: string; timezone: string }, now: number = Date.now()): S | "finalizado" {
  return e.status === "publicado" && hasEventPassed(e, now) ? "finalizado" : e.status;
}

// Ventana de inscripción: puede abrirse en una fecha programada (KIN-625; vacía = desde que el evento se publica) y cerrarse en otra (KIN-626).
export type RegistrationWindow = { opensAt?: string | null; closesAt: string | null; closed: boolean };

// ¿Todavía no llega la apertura programada?
export const isNotOpenYet = (w: Pick<RegistrationWindow, "opensAt">, now: number = Date.now()) => !!w.opensAt && now < Date.parse(w.opensAt);

// ¿Están abiertas las inscripciones? (sin contar cupo ni estado del evento). Sin fecha de cierre, abiertas hasta que el organizador cierre;
// con apertura programada, cerradas hasta que llegue esa fecha (se abren solas: se compara contra la hora actual).
export function isRegistrationOpen(w: RegistrationWindow, now: number = Date.now()): boolean {
  if (w.closed || isNotOpenYet(w, now)) return false;
  return !w.closesAt || now < Date.parse(w.closesAt);
}

// Etapa de un evento para las listas de una serie: borrador, próximo (publicado, las inscripciones aún no abren), inscripciones abiertas,
// cupo lleno, inscripciones cerradas o finalizado.
export type EventPhase = "draft" | "upcoming" | "open" | "full" | "closed" | "finished";
export function eventPhase(e: { status: string; enrolled: number; capacity: number } & RegistrationWindow, now: number = Date.now()): EventPhase {
  if (e.status === "finalizado") return "finished";
  if (e.status === "borrador") return "draft";
  if (e.closed || (e.closesAt && now >= Date.parse(e.closesAt))) return "closed";
  if (isNotOpenYet(e, now)) return "upcoming";
  return e.capacity > 0 && e.enrolled >= e.capacity ? "full" : "open";
}

// "5 de diciembre de 2026, 18:00" en la zona del evento (con la abreviatura de la zona).
export function fmtDeadline(iso: string, tz: string, lang: "es" | "en"): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { timeZone: tz, dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}
