import type { DisciplineId } from "@/lib/disciplines";
import type { RoleChoice } from "@/lib/roles";

// Tipos compartidos de la web. Los datos salen de Supabase (ver src/lib/data/).

export type Category = { id: string; name: string; fee: number };

export type EventItem = {
  id: string; name: string; date: string; city: string; venue: string;
  disciplines: string[]; categories: Category[]; capacity: number; enrolled: number;
  organizer: string; uuid?: string; organizerId?: string; tone: number; cover?: string; photos: { id: string; url: string }[];
  timezone: string; registrationOpensAt: string | null; registrationClosesAt: string | null; registrationClosed: boolean; series: { slug: string; name: string } | null; updatedAt: string; description: string; status: "publicado" | "borrador" | "finalizado";
  maxRoperRating: number | null; // rating máximo para inscribirse (null = sin límite)
  drawType: "round_robin" | "lazada_sorteada"; // tipo de sorteo (KIN-649); no cambia con inscritos o resultados
  lazadaShotsPerPackage: number | null; // solo Lazada Sorteada: tiros que trae un paquete
  rounds: number | null; // rondas del evento, 1 a 20 (null = aún sin definir)
  maxTeamRating: number | null; // rating máximo de la suma de un equipo (null = sin tope)
  resultsClosed: boolean; // los resultados ya están cerrados (candado de la app); un evento finalizado con los resultados abiertos está en corrección
};

// Un rating (1 a 10) por modalidad.
export type Stat = { rating: number; events: number; wins: number; updatedAt?: string; initial?: boolean }; // initial: aún sin eventos, rating de partida

// Participante tal como lo ve el público. El celular NO está aquí: es privado (tabla roper_contacts).
export type Roper = { id: string; name: string; avatarPath: string | null; role?: RoleChoice | null; stats: Partial<Record<DisciplineId, Stat>> };

