// Recuperar la contraseña (KIN-601): reglas puras, sin red, para poder probarlas.

/** Mismas reglas que el registro: mínimo 8; máximo 72 (límite de bcrypt, que es lo que usa Supabase para guardarla). */
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correo con forma válida (no dice si tiene cuenta: eso nunca se revela). */
export const isEmailShape = (email: string) => EMAIL.test(email);

export type NewPasswordError = "short" | "long" | "mismatch";

/** Valida la contraseña nueva y su confirmación. `null` = se puede guardar. */
export function validateNewPassword(password: string, confirm: string): NewPasswordError | null {
  if (password.length < MIN_PASSWORD) return "short";
  if (password.length > MAX_PASSWORD) return "long";
  if (password !== confirm) return "mismatch";
  return null;
}

export type ResetUpdateError = "same" | "weak" | "generic";

/** Traduce el mensaje de Supabase al error que se muestra (no se enseña el texto original). */
export function resetUpdateError(message: string | null | undefined): ResetUpdateError {
  const text = message ?? "";
  if (/different from the old|same as the old|same password/i.test(text)) return "same";
  if (/weak|pwned|leaked|compromised|too short|at least/i.test(text)) return "weak";
  return "generic";
}

/** El enlace del correo es de recuperación (y no de confirmación de registro). */
export const isRecoveryType = (type: string | null | undefined) => type === "recovery";

/** Idioma de la pantalla a partir del parámetro `lang` del enlace. */
export const resetLang = (value: string | null | undefined): "es" | "en" => (value === "en" ? "en" : "es");

/**
 * A dónde va `/auth/confirm` con un enlace de recuperación: con el enlace verificado, a elegir la contraseña nueva;
 * si no, a pedir otro. Nunca al panel ni a «bienvenido»: eso es de la confirmación del registro.
 */
export function recoveryDestination(lang: "es" | "en", verified: boolean): string {
  return verified ? `/${lang}/recuperar/nueva` : `/${lang}/recuperar?error=expired`;
}
