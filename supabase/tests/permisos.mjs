import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
// Aplica TODAS las migraciones de supabase/migrations/ en un Postgres de prueba (PGlite) y comprueba quién puede
// ver o escribir qué (anónimo, organizador sin verificar, organizador verificado y participante).
// Se corre con `npm run test:db`. Sale con código 1 si alguna comprobación falla (para usarlo en CI).
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../migrations", import.meta.url));
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth to anon, authenticated;
  grant usage on schema public to service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
console.log("migraciones aplicadas en orden\n");

// Datos de prueba (como superusuario)
const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b", C = "cccccccc-0000-0000-0000-00000000000c";
await db.exec(`
  insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}');
  insert into profiles (user_id, role, display_name, organizer_verified) values ('${A}','organizador','Org Verificado',true), ('${B}','organizador','Org Nuevo',false), ('${C}','participante','Participante',false);
  insert into ropers (id, full_name, user_id) values ('11111111-0000-0000-0000-000000000001','Ana Estrada','${C}');
  insert into roper_contacts (roper_id, phone_e164) values ('11111111-0000-0000-0000-000000000001','+528112345678');
  insert into events (id, name, organizer_id, status, slug) values
   ('e0000000-0000-0000-0000-000000000001','Publicado','${A}','publicado','pub'),
   ('e0000000-0000-0000-0000-000000000002','Borrador','${A}','borrador','bor');
  insert into event_categories (event_id, name, fee_cents) values ('e0000000-0000-0000-0000-000000000002','Libre',80000);
`);

let failures = 0;
async function as(role, uid, sql, label, expect) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role}`);
  let res;
  try { const r = await db.query(sql); res = `${r.rows.length} fila(s)`; if (r.affectedRows) res = `${r.affectedRows} afectada(s)`; if (r.rows.length === 0 && !r.affectedRows) res = "0 filas"; }
  catch (e) { res = "DENEGADO: " + e.message.slice(0, 60); }
  const ok = expect === "deny" ? res.startsWith("DENEGADO") || res.startsWith("0") : expect === "some" ? /^[1-9]/.test(res) : true;
  if (!ok) failures++;
  console.log(`${ok ? "✔" : "✘ FALLO"}  ${label.padEnd(58)} → ${res}`);
  await db.exec("reset role");
}

console.log("— Anónimo");
await as("anon", null, "select id, full_name from ropers", "ve nombres de participantes", "some");
await as("anon", null, "select user_id from ropers", "NO ve user_id de participantes", "deny");
await as("anon", null, "select * from ropers", "select * a ropers (debe pedir columnas explícitas)", "deny");
await as("anon", null, "select phone_e164 from roper_contacts", "NO ve celulares", "deny");
await as("anon", null, "select id from events", "ve solo eventos públicos (1)", "some");
await as("anon", null, "select id from events where status='borrador'", "NO ve borradores", "deny");
await as("anon", null, "select id from event_categories", "NO ve categorías de un borrador", "deny");
await as("anon", null, "insert into ropers (full_name) values ('x')", "NO crea participantes", "deny");
console.log("— Organizador SIN verificar");
await as("authenticated", B, "select phone_e164 from roper_contacts", "NO ve celulares", "deny");
await as("authenticated", B, "insert into ropers (full_name) values ('x')", "NO registra participantes", "deny");
await as("authenticated", B, "update profiles set organizer_verified = true where user_id = '" + B + "'", "NO se verifica a sí mismo", "deny");
await as("authenticated", B, "insert into profiles (user_id, role, display_name) values (gen_random_uuid(), 'organizador', 'x')", "NO crea el perfil de otra persona", "deny");
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'Mío', '" + B + "', 'borrador')", "SÍ crea su evento", "some");
await as("authenticated", B, "insert into events (id, name, organizer_id, verified) values (gen_random_uuid(), 'Falso', '" + B + "', true)", "NO marca su evento como verificado", "deny");
await as("authenticated", B, "insert into events (id, name, organizer_id) values (gen_random_uuid(), 'Ajeno', '" + A + "')", "NO crea eventos a nombre de otro", "deny");
await as("authenticated", B, "update events set name='hack' where id='e0000000-0000-0000-0000-000000000001'", "NO edita eventos de otro organizador", "deny");
await as("authenticated", B, "select id from events where status='borrador' and organizer_id='" + A + "'", "NO ve el borrador de otro", "deny");
console.log("— Organizador verificado");
await as("authenticated", A, "select phone_e164 from roper_contacts", "SÍ ve celulares", "some");
await as("authenticated", A, "insert into ropers (full_name) values ('Nuevo')", "SÍ registra participantes", "some");
await as("authenticated", A, "select id from events", "ve sus eventos (publicado + borrador)", "some");
await as("authenticated", A, "update events set name='Editado' where id='e0000000-0000-0000-0000-000000000002'", "SÍ edita su evento", "some");
await as("authenticated", A, "insert into event_categories (event_id, name, fee_cents) values ('e0000000-0000-0000-0000-000000000001','Amateur',50000)", "SÍ agrega categorías a su evento", "some");
console.log("— Registro y categorías (0010)");
await as("authenticated", B, "insert into consents (user_id, document, version) values ('" + B + "','terms','2026-11-02')", "SÍ registra su propia aceptación", "some");
await as("authenticated", B, "insert into consents (user_id, document, version) values ('" + A + "','terms','2026-11-02')", "NO registra la aceptación de otra persona", "deny");
await as("authenticated", B, "select id from consents", "ve solo la suya (1)", "some");
await as("authenticated", A, "select phone_e164 from roper_contacts", "verificado sigue viendo celulares", "some");
await as("authenticated", B, "select phone_e164 from roper_contacts", "no verificado sigue sin ver celulares", "deny");
await as("authenticated", C, "select phone_e164 from roper_contacts", "participante ve su propio celular", "some");
await as("authenticated", A, "update event_categories set fee_cents = 90000 where event_id='e0000000-0000-0000-0000-000000000002'", "dueño edita categorías de su evento", "some");
await as("authenticated", B, "update event_categories set fee_cents = 1 where event_id='e0000000-0000-0000-0000-000000000002'", "NO edita categorías de otro", "deny");
await as("authenticated", B, "delete from event_categories where event_id='e0000000-0000-0000-0000-000000000002'", "NO borra categorías de otro", "deny");
console.log("— Participante");
await as("authenticated", C, "select phone_e164 from roper_contacts", "ve SOLO su propio celular (1)", "some");
await as("authenticated", C, "select organizer_verified from profiles", "ve su perfil (1)", "some");
await as("authenticated", C, "select id from registrations", "puede consultar inscripciones sin error (0 propias)", "deny");
await as("authenticated", C, "update ropers set avatar_path='mi/foto.jpg' where user_id = '" + C + "'", "NO edita ropers por user_id (columna oculta)", "deny");
await as("authenticated", C, "update ropers set avatar_path='mi/foto.jpg' where id = '11111111-0000-0000-0000-000000000001'", "SÍ cambia la foto de SU perfil", "some");
await as("authenticated", B, "update ropers set avatar_path='hack.jpg' where id = '11111111-0000-0000-0000-000000000001'", "NO cambia la foto de otra persona", "deny");
await as("authenticated", C, "insert into profiles (user_id, role, display_name) values ('" + C + "', 'organizador', 'x')", "NO se hace organizador (ya tiene perfil / rol)", "deny");

// Comprobación de un valor concreto (no solo permitido o denegado).
async function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? "✔" : "✘ FALLO"}  ${label.padEnd(58)} → ${cond ? "ok" : "no se cumple"}`);
}

console.log("- Códigos de conexión de la app (0011)");
await as("service_role", null, `select rotate_api_token('${A}', 'hash-uno')`, "el servidor genera un código", "some");
await as("service_role", null, `select rotate_api_token('${A}', 'hash-dos')`, "el servidor genera otro (revoca el anterior)", "some");
{
  const r = await db.query(`select count(*) filter (where revoked_at is null)::int as activos, count(*) filter (where revoked_at is not null)::int as revocados from api_tokens where organizer_id = '${A}'`);
  await check("queda 1 código activo y 1 revocado", r.rows[0].activos === 1 && r.rows[0].revocados === 1);
  let dup = false;
  try { await db.query(`insert into api_tokens (organizer_id, token_hash) values ('${A}', 'hash-tres')`); } catch { dup = true; }
  await check("la base impide dos códigos activos del mismo organizador", dup);
}
await as("authenticated", A, "select id, created_at, last_used_at, revoked_at from api_tokens", "el organizador ve las fechas de SUS códigos", "some");
await as("authenticated", A, "select token_hash from api_tokens", "NO ve el hash de sus códigos", "deny");
await as("authenticated", B, "select id from api_tokens", "NO ve códigos de otro organizador", "deny");
await as("authenticated", A, `update api_tokens set revoked_at = null where organizer_id = '${A}'`, "NO reactiva ni edita códigos directo", "deny");
await as("authenticated", A, `insert into api_tokens (organizer_id, token_hash) values ('${A}', 'x')`, "NO crea códigos directo", "deny");
await as("authenticated", A, `select rotate_api_token('${A}', 'x')`, "NO ejecuta la rotación (solo el servidor)", "deny");
await as("anon", null, "select id from api_tokens", "anónimo NO ve códigos", "deny");
await as("authenticated", A, "select * from api_auth_failures", "NO ve los intentos fallidos", "deny");
await as("authenticated", A, "select api_auth_is_blocked('x')", "NO consulta el bloqueo por IP", "deny");
await as("anon", null, "select api_auth_record_failure('x')", "anónimo NO registra intentos fallidos", "deny");
{
  await db.exec("reset role; set role service_role");
  for (let i = 0; i < 20; i++) await db.query("select api_auth_record_failure('ip-mala')");
  const mala = await db.query("select api_auth_is_blocked('ip-mala') as b");
  const buena = await db.query("select api_auth_is_blocked('ip-buena') as b");
  await db.exec("reset role");
  await check("20 fallos seguidos bloquean esa IP", mala.rows[0].b === true);
  await check("otra IP sigue sin bloqueo", buena.rows[0].b === false);
}

console.log(failures ? `\n${failures} comprobación(es) FALLARON` : "\nTodas las comprobaciones de permisos pasan");
process.exit(failures ? 1 : 0);
