// Interpreta la respuesta de la función `licencia_vigente_web` del proyecto de licencias. Sin dependencias, para probarla con `node --test`.
export type LicenseCheck =
  | { status: "valid"; until: string | null; plan: string; orderId: string | null } // until null = licencia sin vencimiento
  | { status: "none" }          // el correo no tiene licencia vigente
  | { status: "unavailable" };  // no se pudo comprobar (red, configuración, clave incorrecta): NO se cambia nada

// Planes de licencia que habilitan a un organizador. Decisión pendiente: ¿un Event Pass (un solo evento) también cuenta? Hoy sí.
export const ACCEPTED_PLANS = ["local", "event_pass"] as const;

export function parseLicenseResponse(body: unknown): LicenseCheck {
  if (typeof body !== "object" || body === null) return { status: "unavailable" };
  const b = body as { valid?: unknown; plan?: unknown; order_id?: unknown; valid_until?: unknown };
  if (b.valid === false) return { status: "none" };
  if (b.valid !== true) return { status: "unavailable" };
  const plan = typeof b.plan === "string" ? b.plan : "";
  if (!(ACCEPTED_PLANS as readonly string[]).includes(plan)) return { status: "none" };
  let until: string | null = null;
  if (b.valid_until != null) {
    const t = typeof b.valid_until === "string" ? Date.parse(b.valid_until) : NaN;
    if (Number.isNaN(t)) return { status: "unavailable" }; // fecha ilegible: falla cerrado, no se activa
    if (t <= Date.now()) return { status: "none" };
    until = new Date(t).toISOString();
  }
  return { status: "valid", until, plan, orderId: typeof b.order_id === "string" && b.order_id ? b.order_id : null };
}
