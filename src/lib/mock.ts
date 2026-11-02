// Datos de ejemplo mientras se conecta Supabase.
// Reemplazar por consultas a public_ropers, events y registrations.
export type Result = { event: string; date: string; discipline: string; time: string; place: number; verified: boolean };
export type Roper = { id: string; name: string; rating: number; events: number; wins: number; verified: boolean; results: Result[] };
export type Category = { name: string; fee: number };
export type EventItem = {
  id: string; name: string; date: string; city: string; venue: string;
  disciplines: string[]; categories: Category[]; capacity: number; registered: string[];
  organizer: string; description: string; status: "publicado" | "borrador" | "finalizado";
};

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

export const events: EventItem[] = [
  { id: "e1", name: "Gran Serie de Lazo Invierno", date: "2026-12-06", city: "Monterrey, NL", venue: "Arena San Pedro",
    disciplines: ["Lazo"], capacity: 100, registered: ["r1", "r2", "r4"], organizer: "Rodeo Norte",
    description: "Serie de tres fechas con premio acumulado. Cupo limitado, cierre de inscripciones 3 días antes.",
    categories: [{ name: "Libre", fee: 800 }, { name: "Amateur", fee: 500 }], status: "publicado" },
  { id: "e2", name: "Copa de Barriles Noroeste", date: "2026-11-22", city: "Hermosillo, SON", venue: "Lienzo Charro Hermosillo",
    disciplines: ["Barriles"], capacity: 60, registered: ["r3"], organizer: "Asociación Noroeste",
    description: "Copa abierta para barrileras de todas las categorías.",
    categories: [{ name: "Abierta", fee: 600 }, { name: "Juvenil", fee: 350 }], status: "publicado" },
  { id: "e3", name: "Serie El Silencio 2026", date: "2026-10-12", city: "Saltillo, COAH", venue: "Rancho El Silencio",
    disciplines: ["Lazo", "Barriles"], capacity: 80, registered: ["r1", "r2"], organizer: "Rodeo Norte",
    description: "Evento finalizado. Consulta los resultados en el perfil de cada participante.",
    categories: [{ name: "Libre", fee: 700 }], status: "finalizado" },
];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}
export const mxn = (n: number) => `$${n.toLocaleString("es-MX")} MXN`;
export const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");
