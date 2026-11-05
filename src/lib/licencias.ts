import "server-only";
import { parseLicenseResponse, type LicenseCheck } from "@/lib/licencias-parse";

// Pregunta al proyecto de licencias si un correo tiene una licencia vigente. Solo recibe sí/no, plan, folio y vencimiento (ver docs/licencias/licencia_vigente_web.sql).
// Usa la llave PÚBLICA de ese proyecto y una clave secreta compartida (LICENCIAS_CHECK_SECRET), solo en el servidor.
// Si algo falla (red, configuración, clave) responde "unavailable": quien llama NO debe cambiar nada.
export async function checkLicenseByEmail(email: string): Promise<LicenseCheck> {
  const url = process.env.LICENCIAS_URL, key = process.env.LICENCIAS_ANON_KEY, secret = process.env.LICENCIAS_CHECK_SECRET;
  if (!url || !key || !secret) return { status: "unavailable" };
  try {
    const res = await fetch(`${url}/rest/v1/rpc/licencia_vigente_web`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_email: email, p_secret: secret }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { status: "unavailable" };
    return parseLicenseResponse(await res.json());
  } catch {
    return { status: "unavailable" };
  }
}
