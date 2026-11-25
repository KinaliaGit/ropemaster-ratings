import test from "node:test";
import assert from "node:assert/strict";
import { MAX_PASSWORD, MIN_PASSWORD, isEmailShape, isRecoveryType, recoveryDestination, resetLang, resetUpdateError, validateNewPassword } from "../src/lib/password-reset.ts";

test("la contraseña nueva pide 8 a 72 caracteres y que las dos coincidan", () => {
  assert.equal(validateNewPassword("a".repeat(MIN_PASSWORD), "a".repeat(MIN_PASSWORD)), null);
  assert.equal(validateNewPassword("a".repeat(MAX_PASSWORD), "a".repeat(MAX_PASSWORD)), null);
  assert.equal(validateNewPassword("a".repeat(MIN_PASSWORD - 1), "a".repeat(MIN_PASSWORD - 1)), "short");
  assert.equal(validateNewPassword("", ""), "short");
  assert.equal(validateNewPassword("a".repeat(MAX_PASSWORD + 1), "a".repeat(MAX_PASSWORD + 1)), "long");
  assert.equal(validateNewPassword("contraseña-1", "contraseña-2"), "mismatch");
});

test("la longitud se revisa antes que la coincidencia", () => {
  assert.equal(validateNewPassword("corta", "otra"), "short");
});

test("los errores de Supabase se traducen a los tres que se muestran", () => {
  assert.equal(resetUpdateError("New password should be different from the old password."), "same");
  assert.equal(resetUpdateError("Password is known to be weak and easy to guess, please choose a different one."), "weak");
  assert.equal(resetUpdateError("Password should be at least 8 characters."), "weak");
  assert.equal(resetUpdateError("Auth session missing!"), "generic");
  assert.equal(resetUpdateError(null), "generic");
  assert.equal(resetUpdateError(undefined), "generic");
});

test("solo type=recovery es un enlace de recuperación; la confirmación del registro no lo es", () => {
  assert.equal(isRecoveryType("recovery"), true);
  for (const other of ["signup", "email", "magiclink", "invite", "", null, undefined]) assert.equal(isRecoveryType(other), false);
});

test("el enlace de recuperación verificado va a elegir contraseña; vencido o usado, a pedir otro; nunca al panel", () => {
  assert.equal(recoveryDestination("es", true), "/es/recuperar/nueva");
  assert.equal(recoveryDestination("en", true), "/en/recuperar/nueva");
  assert.equal(recoveryDestination("es", false), "/es/recuperar?error=expired");
  for (const lang of ["es", "en"]) for (const ok of [true, false]) assert.doesNotMatch(recoveryDestination(lang, ok), /bienvenido|organizador|mi-cuenta/);
});

test("el idioma del enlace cae en español salvo que sea en", () => {
  assert.equal(resetLang("en"), "en");
  for (const v of ["es", "fr", "", null, undefined]) assert.equal(resetLang(v), "es");
});

test("la forma del correo no revela nada: solo descarta lo que claramente no es un correo", () => {
  assert.equal(isEmailShape("ana@example.com"), true);
  for (const bad of ["", "ana", "ana@", "@example.com", "ana @example.com", "ana@example"]) assert.equal(isEmailShape(bad), false);
});
