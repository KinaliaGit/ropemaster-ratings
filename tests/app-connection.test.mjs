import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_TOKEN_PREFIX, INVITE_PREFIX, cleanLabel, guardBatchEvent, guardEvent, guardScope, hashToken, inviteFromLink, isEventToken, isInviteToken,
  newEventToken, newInviteToken, normalizeScopes, parseConnectBody,
} from "../src/lib/app-connection.ts";

const EV = "e5600000-0000-0000-0000-000000000001";
const OTHER = "e5600000-0000-0000-0000-000000000002";
const grant = (scopes = ["event:read"]) => ({ eventId: EV, scopes });
const body = (extra = {}) => JSON.stringify({ contract_version: 1, invite: newInviteToken(), ...extra });

test("los tokens llevan su prefijo, son únicos y el hash es sha256 hexadecimal", () => {
  const invite = newInviteToken(), token = newEventToken();
  assert.ok(invite.startsWith(INVITE_PREFIX) && isInviteToken(invite) && !isEventToken(invite));
  assert.ok(token.startsWith(EVENT_TOKEN_PREFIX) && isEventToken(token) && !isInviteToken(token));
  assert.notEqual(newEventToken(), newEventToken());
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), token);
});

test("normalizeScopes: event:read siempre va, el orden es estable y uno desconocido invalida todo", () => {
  assert.deepEqual(normalizeScopes([]), ["event:read"]);
  assert.deepEqual(normalizeScopes(undefined), ["event:read"]);
  assert.deepEqual(normalizeScopes(["payments:write", "results:write", "results:write"]), ["event:read", "results:write", "payments:write"]);
  assert.equal(normalizeScopes(["event:read", "admin"]), null);
  assert.equal(normalizeScopes([5]), null);
});

test("cleanLabel: sin caracteres de control, espacios colapsados, hasta 60 y 'Operador' si queda vacío", () => {
  assert.equal(cleanLabel("  Mesa\n de   captura\u0007 "), "Mesa de captura");
  assert.equal(cleanLabel(""), "Operador");
  assert.equal(cleanLabel(null), "Operador");
  assert.equal(cleanLabel("x".repeat(100)).length, 60);
});

test("guardScope: la sesión con contraseña (grant null) puede todo; un token solo lo que tiene", () => {
  assert.equal(guardScope(null, "payments:write"), null);
  assert.equal(guardScope(grant(["event:read", "results:write"]), "results:write"), null);
  const denied = guardScope(grant(), "results:write");
  assert.equal(denied.status, 403);
});

test("guardScope responde scope_denied", async () => {
  const body = await guardScope(grant(), "payments:write").json();
  assert.equal(body.code, "scope_denied");
});

test("guardEvent: su evento pasa (sin importar mayúsculas), otro evento es 404 y la sesión con contraseña pasa", async () => {
  assert.equal(guardEvent(grant(), EV), null);
  assert.equal(guardEvent(grant(), EV.toUpperCase()), null);
  assert.equal(guardEvent(null, OTHER), null);
  const other = guardEvent(grant(), OTHER);
  assert.equal(other.status, 404);
  assert.equal((await other.json()).code, "event_not_found");
});

test("guardBatchEvent: todo el lote debe ser del evento; uno ajeno, sin event_id o que no es objeto rechaza el lote con 404", () => {
  assert.equal(guardBatchEvent(null, [{ event_id: OTHER }]), null);
  assert.equal(guardBatchEvent(grant(), []), null);
  assert.equal(guardBatchEvent(grant(), [{ event_id: EV }, { event_id: EV.toUpperCase() }]), null);
  assert.equal(guardBatchEvent(grant(), [{ event_id: EV }, { event_id: OTHER }]).status, 404);
  assert.equal(guardBatchEvent(grant(), [{ id: "x" }]).status, 404);
  assert.equal(guardBatchEvent(grant(), ["texto"]).status, 404);
  assert.equal(guardBatchEvent(grant(), [null]).status, 404);
  assert.equal(guardBatchEvent(grant(), [{ event_id: 7 }]).status, 404);
});

test("parseConnectBody: cuerpo válido devuelve la invitación y el nombre del equipo sin limpiar", () => {
  const invite = newInviteToken();
  const r = parseConnectBody(JSON.stringify({ contract_version: 1, invite: `  ${invite} `, device_name: "Laptop" }), 1);
  assert.deepEqual(r, { ok: true, invite, device: "Laptop" });
});

test("parseConnectBody: errores con su código", () => {
  const cases = [
    ["no es json", "{{", 400, "invalid_json"],
    ["no es objeto", "[]", 400, "invalid_body"],
    ["sin versión", JSON.stringify({ invite: newInviteToken() }), 400, "invalid_body"],
    ["otra versión", body({ contract_version: 2 }), 426, "version_unsupported"],
    ["invite no es texto", body({ invite: 5 }), 400, "invalid_field"],
    ["invite sin el formato", body({ invite: "rm_abcdefghijklmnopqrstuvwxyz" }), 400, "invalid_field"],
    ["invite demasiado corta", body({ invite: "rmi_corta" }), 400, "invalid_field"],
    ["cuerpo demasiado grande", body({ device_name: "x".repeat(5000) }), 413, "payload_too_large"],
  ];
  for (const [name, text, status, code] of cases) {
    const r = parseConnectBody(text, 1);
    assert.equal(r.ok, false, name);
    assert.deepEqual([r.status, r.code], [status, code], name);
  }
});

test("inviteFromLink saca la invitación de un enlace pegado o del código solo", () => {
  const invite = newInviteToken();
  assert.equal(inviteFromLink(invite), invite);
  assert.equal(inviteFromLink(`https://ropemaster.example/app/conectar#${invite}`), invite);
  assert.equal(inviteFromLink(`https://x.test/?invite=${invite}&lang=es`), invite);
  assert.equal(inviteFromLink("hola"), null);
});

test("los ejemplos del contrato son coherentes con el código", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (name) => readFileSync(new URL(`../docs/sync-examples/${name}`, import.meta.url), "utf8");
  const req = parseConnectBody(read("conexion.request.json"), 1);
  assert.equal(req.ok, true);
  const res = JSON.parse(read("conexion.response.json"));
  assert.ok(isEventToken(res.token));
  // La base devuelve los permisos en orden alfabético; lo que importa es que sean los conocidos y que event:read esté.
  assert.deepEqual([...res.scopes].sort(), [...normalizeScopes(res.scopes)].sort());
  assert.ok(res.scopes.includes("event:read"));
});
