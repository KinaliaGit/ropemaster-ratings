// Lógica pura de `POST /api/app/login` (KIN-606): lectura del cuerpo, clasificación de los errores de Supabase Auth y llaves del
// límite de intentos. Sin dependencias para poder probarla con `node --test` (ver tests/app-login.test.mjs). El contrato está en
// docs/SYNC_API.md. La contraseña nunca se guarda ni se escribe en registros: solo pasa por aquí hacia Supabase Auth.

import { createHash } from "node:crypto";

export const MAX_DEVICES = 3;
export const MAX_BODY_BYTES = 4 * 1024;
export const DEVICE_NAME_MAX = 60;

// Límites de intentos FALLIDOS (solo cuentan los fallos). Por correo es más bajo: frena a quien adivina la contraseña de una cuenta.
export const LOGIN_LIMITS = { ip: { limit: 20, windowSeconds: 300 }, email: { limit: 10, windowSeconds: 300 } } as const;

export type LoginFailure = { ok: false; status: 400 | 413 | 426; code: string; error: string };
export type LoginInput = { ok: true; email: string; password: string; deviceName: string };
const fail = (status: LoginFailure["status"], code: string, error: string): LoginFailure => ({ ok: false, status, code, error });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mismo tratamiento que el formulario de la web (auth-actions.ts): se recorta y se corta a 100. Una contraseña creada allí se creó así.
const PASSWORD_MAX = 100;
const EMAIL_MAX = 200;

/** Nombre del equipo: sin caracteres de control, espacios colapsados y hasta 60 caracteres. Vacío o ausente: "Equipo". */
export function cleanDeviceName(raw: unknown): string {
  if (typeof raw !== "string") return "Equipo";
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, DEVICE_NAME_MAX).trim();
  return name || "Equipo";
}

/** Lee el cuerpo JSON: tamaño, versión del contrato y campos. No dice nada de la cuenta: eso lo decide Supabase Auth. */
export function parseLoginBody(text: string, contractVersion: number): LoginInput | LoginFailure {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, "payload_too_large", "El cuerpo es demasiado grande.");
  let data: unknown;
  try { data = JSON.parse(text); } catch { return fail(400, "invalid_json", "El cuerpo no es un JSON válido."); }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return fail(400, "invalid_body", "El cuerpo debe ser un objeto JSON.");
  const body = data as Record<string, unknown>;
  if (body.contract_version === undefined) return fail(400, "invalid_body", "Falta contract_version.");
  if (body.contract_version !== contractVersion) {
    return fail(426, "version_unsupported", `Esta web habla la versión ${contractVersion} del contrato. Actualiza la app.`);
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") return fail(400, "invalid_field", "email y password deben ser texto.");
  const email = body.email.trim().toLowerCase();
  const password = body.password.trim().slice(0, PASSWORD_MAX);
  if (email.length > EMAIL_MAX || !EMAIL.test(email)) return fail(400, "invalid_field", "email no es válido.");
  if (!password) return fail(400, "invalid_field", "Falta la contraseña.");
  if (body.device_name !== undefined && body.device_name !== null && typeof body.device_name !== "string") {
    return fail(400, "invalid_field", "device_name debe ser texto.");
  }
  return { ok: true, email, password, deviceName: cleanDeviceName(body.device_name) };
}

export type AuthFailureKind = "email_not_confirmed" | "rate_limited" | "invalid_credentials" | "unavailable";

/**
 * Qué le pasa al intento según el error de Supabase Auth. "Correo sin confirmar" solo lo devuelve Supabase cuando la contraseña es
 * correcta, así que decirlo no revela nada a quien adivina. Un error del servidor o de red NO es una credencial mala (no cuenta como
 * intento fallido ni gasta el límite): la app debe reintentar luego.
 */
export function classifyAuthError(error: { message?: string; status?: number; code?: string }): AuthFailureKind {
  const code = error.code ?? "";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(error.message ?? "")) return "email_not_confirmed";
  if (error.status === 429 || code.startsWith("over_")) return "rate_limited";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(error.message ?? "")) return "invalid_credentials";
  if (typeof error.status === "number" && error.status >= 400 && error.status < 500) return "invalid_credentials";
  return "unavailable";
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
// Las llaves llevan prefijo para no mezclarse con los intentos con un código inválido (api_auth_failures los guarda por llave).
export const emailKey = (email: string) => `login:email:${sha(email.trim().toLowerCase())}`;
export const ipKey = (ip: string) => `login:ip:${sha(ip)}`;
