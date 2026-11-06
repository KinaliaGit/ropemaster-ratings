import test from "node:test";
import assert from "node:assert/strict";
import { MAX_BODY_BYTES, classifyAuthError, cleanDeviceName, emailKey, ipKey, parseLoginBody } from "../src/lib/app-login.ts";

const body = (extra = {}) => JSON.stringify({ contract_version: 1, email: "Emiliano@Example.com ", password: " secreta-123 ", ...extra });

test("un cuerpo válido se normaliza: correo en minúsculas, contraseña recortada y nombre del equipo", () => {
  const r = parseLoginBody(body({ device_name: "  MacBook   de la oficina " }), 1);
  assert.deepEqual(r, { ok: true, email: "emiliano@example.com", password: "secreta-123", deviceName: "MacBook de la oficina" });
});

test("la contraseña se trata igual que en el formulario de la web: se recorta y se corta a 100", () => {
  const r = parseLoginBody(body({ password: `  ${"x".repeat(150)}  ` }), 1);
  assert.equal(r.ok, true);
  assert.equal(r.password.length, 100);
});

test("sin nombre de equipo queda Equipo; los caracteres de control se quitan y se corta a 60", () => {
  assert.equal(cleanDeviceName(undefined), "Equipo");
  assert.equal(cleanDeviceName("   "), "Equipo");
  assert.equal(cleanDeviceName(42), "Equipo");
  assert.equal(cleanDeviceName("Lap\ntop\u0007 de Ana"), "Lap top de Ana");
  assert.equal(cleanDeviceName("x".repeat(100)).length, 60);
});

test("la versión del contrato: falta es 400, otra es 426", () => {
  const missing = JSON.stringify({ email: "a@b.co", password: "x" });
  assert.deepEqual([parseLoginBody(missing, 1).status, parseLoginBody(missing, 1).code], [400, "invalid_body"]);
  const other = parseLoginBody(body({ contract_version: 2 }), 1);
  assert.deepEqual([other.status, other.code], [426, "version_unsupported"]);
});

test("cuerpos mal formados se rechazan con su código, sin tocar a Supabase", () => {
  const cases = [
    ["no es json", "{{", 400, "invalid_json"],
    ["no es objeto", "[]", 400, "invalid_body"],
    ["correo no es texto", body({ email: 5 }), 400, "invalid_field"],
    ["contraseña no es texto", body({ password: null }), 400, "invalid_field"],
    ["correo sin formato", body({ email: "no-es-correo" }), 400, "invalid_field"],
    ["contraseña vacía", body({ password: "   " }), 400, "invalid_field"],
    ["device_name no es texto", body({ device_name: 7 }), 400, "invalid_field"],
    ["demasiado grande", body({ password: "x".repeat(MAX_BODY_BYTES) }), 413, "payload_too_large"],
  ];
  for (const [name, text, status, code] of cases) {
    const r = parseLoginBody(text, 1);
    assert.equal(r.ok, false, name);
    assert.deepEqual([r.status, r.code], [status, code], name);
  }
});

test("los errores de Supabase Auth se clasifican: credencial mala, correo sin confirmar, límite y falla del servidor", () => {
  assert.equal(classifyAuthError({ code: "invalid_credentials", status: 400, message: "Invalid login credentials" }), "invalid_credentials");
  assert.equal(classifyAuthError({ message: "Invalid login credentials", status: 400 }), "invalid_credentials");
  assert.equal(classifyAuthError({ code: "email_not_confirmed", status: 400, message: "Email not confirmed" }), "email_not_confirmed");
  assert.equal(classifyAuthError({ message: "Email not confirmed" }), "email_not_confirmed");
  assert.equal(classifyAuthError({ status: 429, code: "over_request_rate_limit", message: "rate limit" }), "rate_limited");
  assert.equal(classifyAuthError({ code: "over_email_send_rate_limit" }), "rate_limited");
  assert.equal(classifyAuthError({ status: 403, code: "user_banned" }), "invalid_credentials");
  assert.equal(classifyAuthError({ status: 500, message: "boom" }), "unavailable");
  assert.equal(classifyAuthError({ message: "fetch failed" }), "unavailable", "un error de red no es una credencial mala");
});

test("las llaves del límite no revelan el correo ni la IP y no se mezclan con las de los códigos", () => {
  const a = emailKey("Emiliano@Example.com"), b = emailKey(" emiliano@example.com ");
  assert.equal(a, b, "mayúsculas y espacios no cambian la llave");
  assert.match(a, /^login:email:[0-9a-f]{64}$/);
  assert.match(ipKey("203.0.113.9"), /^login:ip:[0-9a-f]{64}$/);
  assert.ok(!a.includes("emiliano") && !ipKey("203.0.113.9").includes("203"));
  assert.notEqual(emailKey("a@b.co"), emailKey("c@d.co"));
});
