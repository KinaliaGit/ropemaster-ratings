// Datos de ejemplo mientras se conecta Supabase.
// Reemplazar por consultas a public_ropers, events y registrations.
import { DEFAULT_DISCIPLINE, type DisciplineId } from "@/lib/disciplines";

export type Result = { event: string; date: string; discipline: string; time: string; place: number; verified: boolean };
// phone es PRIVADO: solo se muestra en el área de organizadores y en la API de la app, nunca en páginas públicas.
export type Roper = { id: string; name: string; phone: string; stats: Partial<Record<DisciplineId, Stat>>; verified: boolean; results: Result[] };
// Un rating por modalidad (1 a 10).
export type Stat = { rating: number; events: number; wins: number };
export type Category = { name: string; fee: number };
export type EventItem = {
  id: string; name: string; date: string; city: string; venue: string;
  disciplines: string[]; categories: Category[]; capacity: number; registered: string[];
  organizer: string; uuid?: string; organizerId?: string; tone: number; cover?: string; photos: string[]; unpaid?: string[]; updatedAt: string; description: string; status: "publicado" | "borrador" | "finalizado";
};

export const ropers: Roper[] = [
  { id: "r1", phone: "+52 81 1234 5678", name: "Ana Estrada", stats: { lazo: { rating: 9.4, events: 18, wins: 6 } }, verified: true, results: [
    { event: "Serie El Silencio 2026", date: "2026-10-12", discipline: "lazo", time: "8.42", place: 1, verified: true },
    { event: "Jaripeo Regional Norte", date: "2026-09-03", discipline: "lazo", time: "9.12", place: 3, verified: true },
  ] },
  { id: "r2", phone: "+52 81 8765 4321", name: "Mateo Villarreal", stats: { lazo: { rating: 8.8, events: 24, wins: 5 } }, verified: true, results: [
    { event: "Serie El Silencio 2026", date: "2026-10-12", discipline: "lazo", time: "8.91", place: 2, verified: true },
  ] },
  { id: "r3", phone: "+52 662 555 0101", name: "Sofía Ramírez", stats: { lazo: { rating: 8.1, events: 11, wins: 2 } }, verified: false, results: [
    { event: "Copa Noroeste", date: "2026-08-21", discipline: "lazo", time: "9.80", place: 2, verified: false },
  ] },
  { id: "r4", phone: "+52 844 555 0199", name: "Luis Cantú", stats: { lazo: { rating: 7.6, events: 9, wins: 1 } }, verified: false, results: [] },
];

// El rating va de 1 a 10 y se muestra siempre con un decimal.
export const fmtRating = (n: number) => n.toFixed(1);
// Estadística de un participante en una modalidad (undefined si nunca ha competido en ella).
export const statOf = (r: Roper, d: DisciplineId = DEFAULT_DISCIPLINE) => r.stats[d];
// Participantes con rating en la modalidad, de mayor a menor.
export const rankedIn = (list: Roper[], d: DisciplineId = DEFAULT_DISCIPLINE) =>
  list.filter((r) => r.stats[d]).sort((a, b) => b.stats[d]!.rating - a.stats[d]!.rating);
export const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");
