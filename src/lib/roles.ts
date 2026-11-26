// Rol del lazador (KIN-622): con qué rol compite. Los valores son los mismos `header` / `heeler` del contrato con la app.
// `both` (ambos) exige un favorito; header y heeler no llevan favorito. Sin rol = "sin definir" (perfiles anteriores).

export type FavoriteRole = "header" | "heeler";
export type RoperRole = FavoriteRole | "both";
export type RoleChoice = { role: RoperRole; favorite: FavoriteRole | null };

const isFavorite = (v: unknown): v is FavoriteRole => v === "header" || v === "heeler";

/** Valida lo que llega de un formulario o de la base. Con header o heeler el favorito se ignora; con both es obligatorio. null si no es válido. */
export function parseRoleChoice(role: unknown, favorite: unknown): RoleChoice | null {
  if (role === "header" || role === "heeler") return { role, favorite: null };
  if (role === "both" && isFavorite(favorite)) return { role: "both", favorite };
  return null;
}

/** Lo que guarda la base (primary_role / favorite_role): null si el perfil aún no tiene rol. */
export const roleFromRow = (role: string | null, favorite: string | null): RoleChoice | null => parseRoleChoice(role, favorite);

export type RoleLabels = { header: string; heeler: string; both: string; favorite: string; undefined: string };

/** "Cabecero", "Pialador" o "Ambos · favorito: Cabecero". */
export function roleText(choice: RoleChoice | null, l: RoleLabels): string {
  if (!choice) return l.undefined;
  if (choice.role !== "both") return l[choice.role];
  return `${l.both} · ${l.favorite}: ${l[choice.favorite ?? "header"]}`;
}

type EnrolledIn = { id: string; category: string; event: { slug: string | null } | null };

/** KIN-746: quien entró con los dos roles tiene dos inscripciones en la misma categoría y no hay a qué cambiar (la base responde `already`). */
export function canChangeRole(reg: EnrolledIn, mine: EnrolledIn[]): boolean {
  return !mine.some((o) => o.id !== reg.id && o.category === reg.category && o.event?.slug === reg.event?.slug);
}
