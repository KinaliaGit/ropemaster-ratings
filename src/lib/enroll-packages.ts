// Paquetes al inscribirse en Lazada Sorteada con el rol "Ambos" en el perfil (KIN-793). Con un solo rol (cabecero o pialador) se pide UN número de
// paquetes (1 a 99). Con "los dos" se pide un número POR LADO: cada uno de 0 a 99 y el total de al menos 1. La base vuelve a validar todo.
export type EnrollRole = "header" | "heeler" | "both";
export type PackageFields = { single: string; header: string; heeler: string };

const count = (value: string, min: number): number | null => {
  const text = value.trim();
  const n = Number(text);
  return text !== "" && Number.isInteger(n) && n >= min && n <= 99 ? n : null;
};

export function enrollPackages(role: EnrollRole, fields: PackageFields): { header: number; heeler: number; total: number; valid: boolean } {
  if (role === "both") {
    const header = count(fields.header, 0), heeler = count(fields.heeler, 0);
    return { header: header ?? 0, heeler: heeler ?? 0, total: (header ?? 0) + (heeler ?? 0), valid: header !== null && heeler !== null && header + heeler >= 1 };
  }
  const n = count(fields.single, 1);
  return { header: role === "header" ? (n ?? 0) : 0, heeler: role === "heeler" ? (n ?? 0) : 0, total: n ?? 0, valid: n !== null };
}
