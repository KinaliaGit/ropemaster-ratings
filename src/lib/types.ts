import type { DisciplineId } from "@/lib/disciplines";

// Tipos compartidos de la web. Los datos salen de Supabase (ver src/lib/data/).

export type Category = { id: string; name: string; fee: number };

export type EventItem = {
  id: string; name: string; date: string; city: string; venue: string;
  disciplines: string[]; categories: Category[]; capacity: number; enrolled: number;
  organizer: string; uuid?: string; organizerId?: string; tone: number; cover?: string; photos: { id: string; url: string }[];
  updatedAt: string; description: string; status: "publicado" | "borrador" | "finalizado";
  resultsClosed: boolean; // los resultados ya están cerrados (candado de la app); un evento finalizado con los resultados abiertos está en corrección
};

// Un rating (1 a 10) por modalidad.
export type Stat = { rating: number; events: number; wins: number; updatedAt?: string; initial?: boolean }; // initial: aún sin eventos, rating de partida

// Participante tal como lo ve el público. El celular NO está aquí: es privado (tabla roper_contacts).
export type Roper = { id: string; name: string; avatarPath: string | null; stats: Partial<Record<DisciplineId, Stat>> };

