import type { DisciplineId } from "@/lib/disciplines";

// Tipos compartidos de la web. Los datos salen de Supabase (ver src/lib/data/).

export type Category = { name: string; fee: number };

export type EventItem = {
  id: string; name: string; date: string; city: string; venue: string;
  disciplines: string[]; categories: Category[]; capacity: number; registered: string[];
  organizer: string; uuid?: string; organizerId?: string; tone: number; cover?: string; photos: { id: string; url: string }[]; unpaid?: string[];
  updatedAt: string; description: string; status: "publicado" | "borrador" | "finalizado";
};

// Un rating (1 a 10) por modalidad.
export type Stat = { rating: number; events: number; wins: number; updatedAt?: string };

// Participante tal como lo ve el público. El celular NO está aquí: es privado (tabla roper_contacts).
export type Roper = { id: string; name: string; avatarPath: string | null; stats: Partial<Record<DisciplineId, Stat>> };

export type Result = {
  id: string; event: string; eventSlug: string | null; date: string; discipline: string;
  timeMs: number | null; penaltyMs: number; disqualified: boolean; place: number | null; eventVerified: boolean;
};
