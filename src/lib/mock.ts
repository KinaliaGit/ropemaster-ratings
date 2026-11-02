// Datos de ejemplo mientras se conecta Supabase. Reemplazar por consultas a public_ropers / event_results.
export type Result = { event: string; date: string; discipline: string; time: string; place: number; verified: boolean };
export type Roper = { id: string; name: string; rating: number; events: number; wins: number; verified: boolean; results: Result[] };

export const ropers: Roper[] = [
  { id: "r1", name: "Ana Estrada", rating: 94, events: 18, wins: 6, verified: true, results: [
    { event: "Serie El Silencio 2026", date: "2026-10-12", discipline: "Lazo", time: "8.42", place: 1, verified: true },
    { event: "Jaripeo Regional Norte", date: "2026-09-03", discipline: "Barriles", time: "15.87", place: 3, verified: true },
  ] },
  { id: "r2", name: "Mateo Villarreal", rating: 88, events: 24, wins: 5, verified: true, results: [
    { event: "Serie El Silencio 2026", date: "2026-10-12", discipline: "Lazo", time: "8.91", place: 2, verified: true },
  ] },
  { id: "r3", name: "Sofía Ramírez", rating: 81, events: 11, wins: 2, verified: false, results: [
    { event: "Copa Noroeste", date: "2026-08-21", discipline: "Barriles", time: "16.20", place: 2, verified: false },
  ] },
  { id: "r4", name: "Luis Cantú", rating: 76, events: 9, wins: 1, verified: false, results: [] },
];
