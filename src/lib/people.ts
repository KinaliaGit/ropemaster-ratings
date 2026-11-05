import { DEFAULT_DISCIPLINE, type DisciplineId } from "@/lib/disciplines";
import type { Roper } from "@/lib/types";
import { AVATARS_BUCKET, publicStorageUrl } from "@/lib/storage";

export const initials = (n: string) => n.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
// El rating va de 1 a 10 y se muestra siempre con un decimal.
export const fmtRating = (n: number) => n.toFixed(1);
// Tiempo en segundos con dos decimales (la base guarda milisegundos).
export const fmtTime = (ms: number | null) => (ms == null ? "–" : (ms / 1000).toFixed(2));
// Estadística de un participante en una modalidad (undefined si nunca ha competido en ella).
export const statOf = (r: Roper, d: DisciplineId = DEFAULT_DISCIPLINE) => r.stats[d];
// URL pública de la foto (bucket público "avatars" de Supabase Storage).
export const publicAvatarUrl = (path: string | null | undefined) => (path ? publicStorageUrl(AVATARS_BUCKET, path) : null);
