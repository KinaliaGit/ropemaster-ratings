import "server-only";
import { LEGAL } from "@/lib/legal";

// Constancia de aceptación de términos y aviso de privacidad (quién, qué versión y cuándo).
// En memoria mientras no haya base de datos. TODO: tabla consents (migración 0008).
type Consent = { role: string; userId: string; version: string; acceptedAt: string };
const g = globalThis as unknown as { __rmConsents?: Consent[] };
const log = (g.__rmConsents ??= []);

export function recordConsent(role: string, userId: string) {
  log.push({ role, userId, version: LEGAL.version, acceptedAt: new Date().toISOString() });
}
