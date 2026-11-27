import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
// Aplica TODAS las migraciones de supabase/migrations/ en un Postgres de prueba (PGlite) y comprueba quién puede
// ver o escribir qué (anónimo, organizador sin verificar, organizador verificado y participante).
// Se corre con `npm run test:db`. Sale con código 1 si alguna comprobación falla (para usarlo en CI).
import { fileURLToPath } from "node:url";
import { statusByDate } from "../../src/lib/event-time.ts"; // la regla de finalización de la web: la de SQL (public.event_phase) debe dar lo mismo (KIN-769)
const dir = fileURLToPath(new URL("../migrations", import.meta.url));
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant usage on schema public to service_role;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
console.log("migraciones aplicadas en orden\n");

// Datos de prueba (como superusuario)
const A = "aaaaaaaa-0000-0000-0000-00000000000a", B = "bbbbbbbb-0000-0000-0000-00000000000b", C = "cccccccc-0000-0000-0000-00000000000c", D = "dddddddd-0000-0000-0000-00000000000d";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${A}','a@x.com',now()), ('${B}','b@x.com',now()), ('${C}','c@x.com',now()), ('${D}','d@x.com',now());
  insert into profiles (user_id, role, display_name, organizer_verified) values ('${A}','organizador','Org Verificado',true), ('${B}','organizador','Org Nuevo',false), ('${C}','participante','Participante',false), ('${D}','organizador','Admin',true);
  insert into admins (user_id) values ('${D}');
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
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'Mío', '" + B + "', 'borrador')", "sin licencia ni aprobación NO crea eventos", "deny");
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
console.log("— Fotos en Storage (0017, antes 0011)");
const OBJ = (b, n) => `insert into storage.objects (bucket_id, name) values ('${b}', '${n}')`;
const R1 = "11111111-0000-0000-0000-000000000001", E2 = "e0000000-0000-0000-0000-000000000002";
await as("authenticated", C, OBJ("avatars", `${R1}/a.jpg`), "participante SUBE la foto a su carpeta", "some");
await as("authenticated", B, OBJ("avatars", `${R1}/b.jpg`), "otro usuario NO sube a la carpeta de un participante", "deny");
await as("authenticated", C, OBJ("avatars", "22222222-0000-0000-0000-000000000002/c.jpg"), "participante NO sube a otra carpeta", "deny");
await as("authenticated", B, `delete from storage.objects where name = '${R1}/a.jpg'`, "otro usuario NO borra la foto ajena", "deny");
await as("authenticated", C, `delete from storage.objects where name = '${R1}/a.jpg'`, "participante SÍ borra su foto", "some");
await as("authenticated", A, OBJ("event-photos", `${E2}/p1.jpg`), "organizador SUBE foto a su evento", "some");
await as("authenticated", B, OBJ("event-photos", `${E2}/p2.jpg`), "otro organizador NO sube al evento ajeno", "deny");
await as("authenticated", B, `update storage.objects set name = '${E2}/zz.jpg' where name = '${E2}/p1.jpg'`, "otro organizador NO reemplaza foto ajena", "deny");
await as("authenticated", B, `delete from storage.objects where name = '${E2}/p1.jpg'`, "otro organizador NO borra foto ajena", "deny");
await as("authenticated", A, `update storage.objects set name = '${E2}/p1b.jpg' where name = '${E2}/p1.jpg'`, "organizador SÍ reemplaza su foto", "some");
await as("authenticated", A, `delete from storage.objects where name = '${E2}/p1b.jpg'`, "organizador SÍ borra su foto", "some");
await as("anon", null, OBJ("event-photos", `${E2}/x.jpg`), "anónimo NO sube fotos", "deny");
await as("authenticated", C, "select public.my_roper_id()::text as id", "my_roper_id() devuelve el perfil propio", "some");
await as("authenticated", B, "select public.my_roper_id() as id where public.my_roper_id() is not null", "my_roper_id() es nulo para quien no es participante", "deny");
await as("anon", null, "select public.my_roper_id()", "anónimo NO ejecuta my_roper_id()", "deny");
const lim = await db.query("select id, file_size_limit, allowed_mime_types from storage.buckets where id in ('avatars','event-photos') order by id");
console.log("límites de buckets:", JSON.stringify(lim.rows));
console.log("— Administración y directorio (0012)");
await as("authenticated", D, "select user_id from profiles", "admin ve TODOS los perfiles (4)", "some");
await as("authenticated", B, "select user_id from profiles where user_id <> '" + B + "'", "organizador NO ve perfiles ajenos", "deny");
await as("authenticated", D, "select public.admin_set_organizer_verified('" + B + "', true)", "admin VERIFICA a un organizador", "some");
await as("authenticated", D, "select organizer_verified from profiles where user_id = '" + B + "' and organizer_verified", "quedó verificado", "some");
await as("authenticated", B, "select public.admin_set_organizer_verified('" + B + "', false)", "un organizador NO se (des)verifica a sí mismo con la función", "deny");
await as("authenticated", C, "select public.admin_set_organizer_verified('" + B + "', true)", "un participante NO usa la función de admin", "deny");
await as("anon", null, "select public.admin_set_organizer_verified('" + B + "', true)", "anónimo NO usa la función de admin", "deny");
await as("authenticated", D, "select public.admin_set_organizer_verified('" + C + "', true)", "NO se verifica a quien no es organizador", "deny");
await as("authenticated", D, "select action from admin_audit", "admin lee la auditoría (1 registro)", "some");
await as("authenticated", B, "select action from admin_audit", "organizador NO lee la auditoría", "deny");
await as("authenticated", D, "insert into admin_audit (admin_id, target_user_id, action) values ('" + D + "','" + B + "','verify')", "NADIE escribe la auditoría a mano", "deny");
await as("authenticated", B, "insert into admins (user_id) values ('" + B + "')", "un usuario NO se agrega como admin", "deny");
await as("authenticated", D, "insert into admins (user_id) values ('" + B + "')", "ni siquiera un admin agrega admins desde la web", "deny");
await as("authenticated", B, "select user_id from admins", "un usuario no admin NO ve la lista de admins", "deny");
await as("authenticated", D, "select phone_e164 from roper_contacts", "admin ve celulares", "some");
await as("authenticated", B, "update profiles set organizer_verified = false where user_id = '" + B + "'", "sigue sin poder editar organizer_verified directo", "deny");
await as("authenticated", B, "insert into profiles (user_id, role, display_name, email) values (gen_random_uuid(), 'organizador', 'x', 'x@x.com')", "no crea perfiles ajenos con correo", "deny");
// alta de participantes por correo (B ahora está verificado por el admin; A ya lo estaba)
await as("authenticated", A, "select public.create_participant('  Nuevo Participante ', ' Nuevo@Ejemplo.COM ')::text as id", "organizador verificado crea participante + correo", "some");
await as("authenticated", A, "select count(*) as n from roper_contacts where email = 'nuevo@ejemplo.com' having count(*) = 1", "el correo quedó guardado en minúsculas", "some");
await as("authenticated", A, "select public.create_participant('Otro', 'nuevo@ejemplo.com')", "un correo repetido se rechaza (único)", "deny");
await as("authenticated", A, "select public.create_participant('Mal Correo', 'no-es-correo')", "correo inválido se rechaza", "deny");
await as("authenticated", A, "select count(*) from ropers where full_name in ('Mal Correo','Otro') having count(*) > 0", "y no deja un participante a medias (atómico)", "deny");
await as("authenticated", C, "select public.create_participant('Intruso', 'intruso@x.com')", "un participante NO crea participantes", "deny");
await as("anon", null, "select public.create_participant('Anon', 'anon@x.com')", "anónimo NO crea participantes", "deny");
console.log("— Cuentas de participante y reclamo por correo (0013)");
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('eeeeeeee-0000-0000-0000-00000000000e','nuevo@ejemplo.com',now()), ('ffffffff-0000-0000-0000-00000000000f','otro@x.com',now()), ('99999999-0000-0000-0000-000000000009','sinconfirmar@x.com',null);`);
const E = "eeeeeeee-0000-0000-0000-00000000000e", F = "ffffffff-0000-0000-0000-00000000000f", G = "99999999-0000-0000-0000-000000000009";
await as("authenticated", E, "insert into profiles (user_id, role, display_name) values ('" + E + "', 'participante', 'Nuevo Participante')", "un participante crea su perfil", "some");
await as("authenticated", F, "insert into profiles (user_id, role, display_name) values ('" + E + "', 'participante', 'x')", "NO crea el perfil de otra persona", "deny");
await as("authenticated", E, "select public.claim_my_roper('Nuevo Participante')", "reclama el perfil creado por el organizador (mismo correo)", "some");
await as("authenticated", E, "select r.id from ropers r where r.full_name = 'Nuevo Participante' and r.id = (select public.claim_my_roper('x'))", "reclamar de nuevo devuelve el mismo perfil", "some");
await as("authenticated", E, "select count(*) from ropers where full_name = 'Nuevo Participante' having count(*) = 1", "sin duplicados tras reclamar", "some");
await as("authenticated", A, "select claimed from roper_contacts where email = 'nuevo@ejemplo.com' and claimed", "el organizador ve el perfil como reclamado", "some");
await as("authenticated", A, "update roper_contacts set claimed = false where email = 'nuevo@ejemplo.com'", "nadie edita roper_contacts desde la API", "deny");
await as("authenticated", E, "select phone_e164, email from roper_contacts where email = 'nuevo@ejemplo.com'", "ya es dueño y ve su propio correo", "some");
await as("authenticated", F, "insert into profiles (user_id, role, display_name) values ('" + F + "', 'participante', 'Otro')", "otro participante crea su perfil", "some");
await as("authenticated", F, "select public.claim_my_roper('Otro Nombre')", "sin perfil previo, crea uno nuevo con su correo", "some");
await as("authenticated", F, "select count(*) from roper_contacts where email = 'otro@x.com' having count(*) = 1", "queda su correo de contacto", "some");
await as("authenticated", G, "insert into profiles (user_id, role, display_name) values ('" + G + "', 'participante', 'Sin confirmar')", "cuenta sin confirmar crea su perfil", "some");
await as("authenticated", G, "select public.claim_my_roper('Sin confirmar')", "correo SIN confirmar NO reclama ni crea perfil", "deny");
await as("authenticated", B, "select public.claim_my_roper('Org Lazador')", "un organizador SÍ crea su perfil de lazador", "some");
await as("authenticated", B, "select count(*) from ropers where full_name = 'Org Lazador' having count(*) = 1", "un solo perfil, enlazado a su cuenta", "some");
await as("authenticated", B, "select public.claim_my_roper('Otro')", "pedirlo otra vez devuelve el mismo perfil", "some");
await as("authenticated", B, "select count(*) from ropers where full_name in ('Org Lazador','Otro') having count(*) = 1", "sin duplicados", "some");
await as("anon", null, "select public.claim_my_roper('Anon')", "anónimo NO usa claim_my_roper", "deny");
console.log("— Inscripciones (0014)");
const EV = "e0000000-0000-0000-0000-000000000001"; // publicado, sin cupo definido
await db.exec(`
  insert into event_categories (id, event_id, name, fee_cents) values ('ca000000-0000-0000-0000-000000000001','${EV}','Libre',50000), ('ca000000-0000-0000-0000-000000000002','${EV}','Amateur',30000);
  insert into events (id, name, organizer_id, status, slug, capacity) values ('e0000000-0000-0000-0000-000000000003','Con cupo 1','${A}','publicado','cupo1',1);
  insert into event_categories (id, event_id, name, fee_cents) values ('ca000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000003','Libre',10000);
  insert into auth.users (id, email, email_confirmed_at) values ('11111111-aaaa-0000-0000-000000000001','p2@x.com',now());
  insert into profiles (user_id, role, display_name) values ('11111111-aaaa-0000-0000-000000000001','participante','P2');
  insert into ropers (id, full_name, user_id) values ('22222222-0000-0000-0000-000000000002','Participante Dos','11111111-aaaa-0000-0000-000000000001');
`);
const P2 = "11111111-aaaa-0000-0000-000000000001";
const CAT1 = "ca000000-0000-0000-0000-000000000001", CAT2 = "ca000000-0000-0000-0000-000000000002", CUPO = "e0000000-0000-0000-0000-000000000003", CATC = "ca000000-0000-0000-0000-000000000003";
await as("authenticated", C, `insert into registrations (event_id, roper_id, category_id) values ('${EV}','11111111-0000-0000-0000-000000000001','${CAT1}')`, "NADIE inscribe escribiendo la tabla directo", "deny");
await as("anon", null, "select id from registrations", "anónimo NO lee inscripciones", "deny");
await as("authenticated", C, `select public.register_for_event('${EV}','${CAT1}')`, "participante se inscribe", "some");
await as("authenticated", C, `select public.register_for_event('${EV}','${CAT1}')`, "NO se inscribe dos veces en la misma categoría", "deny");
await as("authenticated", C, `select public.register_for_event('${EV}','${CAT2}')`, "SÍ puede inscribirse en otra categoría", "some");
await as("authenticated", C, `select public.register_for_event('${EV}','${CATC}')`, "categoría de otro evento se rechaza", "deny");
await as("authenticated", C, "select public.register_for_event('e0000000-0000-0000-0000-000000000002','" + CAT1 + "')", "evento en borrador no acepta inscripciones", "deny");
await as("authenticated", A, `select public.register_for_event('${EV}','${CAT1}')`, "un organizador SIN perfil de lazador NO se inscribe", "deny");
await as("anon", null, `select public.register_for_event('${EV}','${CAT1}')`, "anónimo NO se inscribe", "deny");
await as("authenticated", C, "select amount_cents from registrations where category_id = '" + CAT1 + "' and amount_cents = 50000", "el precio sale de la categoría (no del navegador)", "some");
await as("authenticated", C, "select id from registrations", "el participante ve sus inscripciones (2)", "some");
await as("authenticated", P2, "select id from registrations", "otro participante NO ve inscripciones ajenas", "deny");
await as("authenticated", A, "select id from registrations", "el organizador ve las inscripciones de SU evento", "some");
await as("authenticated", B, "select id from registrations", "otro organizador NO las ve", "deny");
await as("anon", null, "select n from public.event_registration_counts() where n = 2", "conteo público de inscritos", "some");

console.log("— Límite de rating individual (0036)");
const RL_EVENT = "e0000000-0000-0000-0000-0000000000a1", RL_CAT = "ca000000-0000-0000-0000-0000000000a1";
const RL_HIGH = "22222222-0000-0000-0000-0000000000a3", RL_NEW = "22222222-0000-0000-0000-0000000000a4";
const U_HIGH = "11111111-aaaa-0000-0000-0000000000a3", U_NEW = "11111111-aaaa-0000-0000-0000000000a4";
await db.exec(`
  insert into events (id, name, organizer_id, status, slug, capacity, disciplines, max_roper_rating) values ('${RL_EVENT}','Con límite','${A}','publicado','con-limite',10,'{lazo}',6.5);
  insert into event_categories (id, event_id, name, fee_cents) values ('${RL_CAT}','${RL_EVENT}','Libre',10000);
  insert into auth.users (id, email, email_confirmed_at) values ('${U_HIGH}','alto@x.com',now()), ('${U_NEW}','nuevo@x.com',now());
  insert into profiles (user_id, role, display_name) values ('${U_HIGH}','participante','Alto'), ('${U_NEW}','participante','Nuevo');
  insert into ropers (id, full_name, user_id) values ('${RL_HIGH}','Rating Alto','${U_HIGH}'), ('${RL_NEW}','Rating Nuevo','${U_NEW}');
  insert into roper_ratings (roper_id, discipline, rating) values ('${RL_HIGH}','lazo',7.2), ('${RL_HIGH}','barriles',3.0), ('11111111-0000-0000-0000-000000000001','lazo',6.5);
`);
await as("authenticated", U_HIGH, `select public.register_for_event('${RL_EVENT}','${RL_CAT}')`, "con rating por ENCIMA del límite NO se inscribe", "deny");
await as("authenticated", C, `select public.register_for_event('${RL_EVENT}','${RL_CAT}')`, "con rating IGUAL al límite sí se inscribe", "some");
await as("authenticated", U_NEW, `select public.register_for_event('${RL_EVENT}','${RL_CAT}')`, "sin rating todavía (parte de 1) sí se inscribe", "some");
await db.exec(`update events set max_roper_rating = null where id = '${RL_EVENT}'`);
await as("authenticated", U_HIGH, `select public.register_for_event('${RL_EVENT}','${RL_CAT}')`, "sin límite se inscribe cualquier rating", "some");
await db.exec(`update events set max_roper_rating = 6.5, disciplines = '{barriles}' where id = '${RL_EVENT}'`);
await as("authenticated", P2, `select public.register_for_event('${RL_EVENT}','${RL_CAT}')`, "cuenta el rating de la modalidad del evento (no de otra)", "some");
await db.exec(`delete from registrations where event_id = '${RL_EVENT}'; update events set disciplines = '{lazo}' where id = '${RL_EVENT}'`);
await as("authenticated", A, "update events set max_roper_rating = 5 where id = '" + RL_EVENT + "'", "el organizador dueño SÍ cambia el límite", "some");
await as("authenticated", B, "update events set max_roper_rating = 1 where id = '" + RL_EVENT + "'", "otro organizador NO cambia el límite", "deny");
await as("authenticated", C, "update events set max_roper_rating = 10 where id = '" + RL_EVENT + "'", "un participante NO cambia el límite", "deny");
await as("authenticated", A, "update events set max_roper_rating = 11 where id = '" + RL_EVENT + "'", "un límite fuera de 0 a 10 se rechaza", "deny");
await as("anon", null, "select max_roper_rating from events where max_roper_rating is not null and slug = 'con-limite'", "el límite de un evento publicado es público", "some");
await as("anon", null, `select roper_id from public.event_registrants('${EV}')`, "lista pública de inscritos (ids)", "some");
await as("anon", null, "select roper_id from public.event_registrants('e0000000-0000-0000-0000-000000000002')", "la lista de un borrador NO es pública", "deny");
// cupo: 1 lugar; el segundo falla
await as("authenticated", C, `select public.register_for_event('${CUPO}','${CATC}')`, "toma el último lugar", "some");
await as("authenticated", P2, `select public.register_for_event('${CUPO}','${CATC}')`, "cupo lleno: el siguiente se rechaza", "deny");
// carrera: dos inscripciones al mismo tiempo al último lugar de un evento nuevo
await db.exec(`insert into events (id, name, organizer_id, status, slug, capacity) values ('e0000000-0000-0000-0000-000000000004','Carrera','${A}','publicado','carrera',1);
  insert into event_categories (id, event_id, name, fee_cents) values ('ca000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000004','Libre',1000);`);
{
  const results = await Promise.allSettled([C, P2].map(async (u) => {
    const r = await db.transaction(async (tx) => {
      await tx.exec(`select set_config('request.jwt.claim.sub','${u}',true); set local role authenticated`);
      return tx.query("select public.register_for_event('e0000000-0000-0000-0000-000000000004','ca000000-0000-0000-0000-000000000004')");
    });
    return r;
  }));
  const ok = results.filter((x) => x.status === "fulfilled").length;
  const n = (await db.query("select count(*)::int as n from registrations where event_id = 'e0000000-0000-0000-0000-000000000004'")).rows[0].n;
  const pass = n === 1 && ok === 1; if (!pass) failures++;
  console.log(`${pass ? "✔" : "✘ FALLO"}  dos inscripciones al último lugar: solo una entra               → inscritos=${n}, aceptadas=${ok}`);
}
await as("authenticated", C, "select public.cancel_registration((select id from registrations where category_id = '" + CAT2 + "'))", "cancela su inscripción pendiente", "some");
await as("authenticated", P2, "select public.cancel_registration((select id from registrations where category_id = '" + CAT1 + "'))", "NO cancela la de otra persona", "deny");
await db.exec("update registrations set payment_status = 'pagado' where category_id = '" + CAT1 + "'");
await as("authenticated", C, "select public.cancel_registration((select id from registrations where category_id = '" + CAT1 + "'))", "una inscripción pagada NO se cancela sola", "deny");
console.log("— Licencia de organizadores (0015)");
// B (admin lo verificó antes en este script) se vuelve a dejar sin aprobar para probar la licencia
await db.exec(`update profiles set organizer_verified = false where user_id = '${B}'`);
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'Sin licencia', '" + B + "', 'borrador')", "sin licencia ni aprobación NO crea eventos", "deny");
await as("authenticated", B, "select roper_id from roper_contacts where roper_id <> (select public.my_roper_id())", "sin licencia NO ve el directorio (solo su propio contacto)", "deny");
await as("authenticated", B, "select public.create_participant('Sin Licencia', 'sl@x.com')", "sin licencia NO registra participantes", "deny");
await as("authenticated", B, "select user_id from profiles where user_id = '" + B + "'", "pero sí ve su propia cuenta", "some");
await db.exec(`update profiles set license_valid_until = now() + interval '30 days', license_order_id = 'ORD-1' where user_id = '${B}'`);
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'Con licencia', '" + B + "', 'borrador')", "licencia vigente: SÍ crea eventos", "some");
await as("authenticated", B, "select public.create_participant('Con Licencia', 'cl@x.com')::text", "licencia vigente: SÍ registra participantes", "some");
await as("authenticated", B, "select email from roper_contacts", "licencia vigente: ve el directorio", "some");
await db.exec(`update profiles set license_valid_until = 'infinity' where user_id = '${B}'`);
await as("authenticated", B, "update events set name = 'Editado B' where organizer_id = '" + B + "'", "licencia sin vencimiento: edita sus eventos", "some");
await db.exec(`update profiles set license_valid_until = now() - interval '1 day' where user_id = '${B}'`);
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'Vencida', '" + B + "', 'borrador')", "licencia VENCIDA: NO crea eventos", "deny");
await as("authenticated", B, "update events set status = 'publicado' where organizer_id = '" + B + "'", "licencia VENCIDA: NO publica ni edita", "deny");
await as("authenticated", B, "insert into event_categories (event_id, name, fee_cents) select id, 'X', 1 from events where organizer_id = '" + B + "' limit 1", "licencia VENCIDA: NO agrega categorías", "deny");
await as("authenticated", B, "select roper_id from roper_contacts where roper_id <> (select public.my_roper_id())", "licencia VENCIDA: NO ve el directorio (solo su propio contacto)", "deny");
await as("authenticated", B, "select public.create_participant('Vencida', 'v@x.com')", "licencia VENCIDA: NO registra participantes", "deny");
await as("authenticated", B, "select id from events where organizer_id = '" + B + "'", "licencia VENCIDA: aún ve sus propios eventos", "some");
await as("authenticated", B, "update profiles set license_valid_until = 'infinity' where user_id = '" + B + "'", "NO se pone una licencia a sí mismo", "deny");
await as("authenticated", B, "update profiles set license_order_id = 'x' where user_id = '" + B + "'", "NO escribe su folio de licencia", "deny");
await db.exec(`update profiles set organizer_verified = true where user_id = '${B}'`);
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'Aprobado a mano', '" + B + "', 'borrador')", "vencida pero aprobado por un admin: SÍ opera", "some");
await as("authenticated", B, `select public.register_for_event('${EV}','${CAT2}')`, "organizador con perfil de lazador SÍ se inscribe", "some");
await as("authenticated", B, "select role from profiles where user_id = '" + B + "' and role = 'organizador'", "y sigue siendo organizador", "some");
await db.exec(`update profiles set organizer_verified = false, license_valid_until = now() - interval '1 day' where user_id = '${B}'`);
await as("authenticated", B, `select public.register_for_event('${EV}','${CAT1}')`, "con la licencia VENCIDA igual se inscribe como lazador", "some");
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'x', '" + B + "', 'borrador')", "pero NO crea eventos con la licencia vencida", "deny");
await as("authenticated", B, "update ropers set avatar_path = 'a/b.jpg' where id = (select public.my_roper_id())", "el organizador cambia la foto de su perfil de lazador", "some");
console.log("— Métodos de pago (0018)");
await db.exec(`update profiles set organizer_verified = true, license_valid_until = null where user_id in ('${A}','${B}')`);
await db.exec(`insert into registrations (id, event_id, roper_id, category_id) values ('9e000000-0000-0000-0000-000000000001','${EV}','22222222-0000-0000-0000-000000000002','${CAT1}')`);
const REG = "9e000000-0000-0000-0000-000000000001";
await as("authenticated", P2, `select public.set_registration_payment('${REG}','efectivo')`, "el participante NO se marca a sí mismo como pagado", "deny");
await as("authenticated", B, `select public.set_registration_payment('${REG}','efectivo')`, "otro organizador NO marca pagos de un evento ajeno", "deny");
await as("anon", null, `select public.set_registration_payment('${REG}','efectivo')`, "anónimo NO marca pagos", "deny");
await as("authenticated", A, `select public.set_registration_payment('${REG}','tarjeta')`, "método inválido se rechaza", "deny");
await as("authenticated", A, `update registrations set payment_status = 'pagado' where id = '${REG}'`, "el organizador NO escribe la tabla directo", "deny");
await as("authenticated", A, `select public.set_registration_payment('${REG}','efectivo')`, "el organizador marca pagado en efectivo", "some");
await as("authenticated", P2, `select payment_status, payment_method from registrations where id = '${REG}' and payment_status = 'pagado' and payment_method = 'efectivo'`, "el participante ve su pago como pagado (efectivo)", "some");
await as("authenticated", P2, `select public.cancel_registration('${REG}')`, "una inscripción pagada NO se cancela sola", "deny");
await as("authenticated", A, `select public.set_registration_payment('${REG}','transferencia')`, "puede corregir el método a transferencia", "some");
await as("authenticated", A, `select public.set_registration_payment('${REG}', null)`, "puede deshacer el pago (vuelve a pendiente)", "some");
await as("authenticated", A, `select paid_at from registrations where id = '${REG}' and paid_at is null and payment_status = 'pendiente'`, "queda pendiente y sin fecha de pago", "some");
await db.exec(`update registrations set payment_status = 'pagado', payment_method = 'stripe', provider_payment_id = 'cs_1' where id = '${REG}'`);
await as("authenticated", A, `select public.set_registration_payment('${REG}', null)`, "un pago en línea (Stripe) NO se deshace a mano", "deny");
await as("authenticated", A, `select public.set_registration_payment('${REG}','efectivo')`, "ni se cambia el método de un pago en línea", "deny");
await as("authenticated", A, `select public.confirm_stripe_payment('${REG}','cs_x',100)`, "el organizador NO confirma pagos de Stripe", "deny");
await as("authenticated", P2, `select public.confirm_stripe_payment('${REG}','cs_x',100)`, "el participante NO confirma pagos de Stripe", "deny");
await as("anon", null, `select public.confirm_stripe_payment('${REG}','cs_x',100)`, "anónimo NO confirma pagos de Stripe", "deny");
await as("service_role", null, `select public.confirm_stripe_payment('${REG}','cs_1',120000)`, "el servidor SÍ confirma (idempotente, mismo id)", "some");
await db.exec(`update registrations set payment_status = 'pendiente', payment_method = null, provider_payment_id = null where id = '${REG}'`);
// instrucciones de pago
await as("authenticated", A, `insert into event_payment_info (event_id, instructions) values ('${EV}', 'CLABE 012345678901234567 · Banco X · Juan Pérez')`, "el organizador escribe las instrucciones de pago", "some");
await as("authenticated", P2, `select instructions from event_payment_info where event_id = '${EV}'`, "un INSCRITO ve las instrucciones", "some");
await as("authenticated", C, `select instructions from event_payment_info where event_id = '${EV}'`, "otro inscrito también", "some");
await as("authenticated", B, `select instructions from event_payment_info where event_id = '${EV}'`, "otro organizador que también está inscrito (como lazador) SÍ las ve", "some");
await as("anon", null, `select instructions from event_payment_info`, "anónimo NO las ve", "deny");
await as("authenticated", D, `select instructions from event_payment_info where event_id = '${EV}'`, "un no inscrito (admin sin inscripción) NO las ve", "deny");
await as("authenticated", B, `insert into event_payment_info (event_id, instructions) values ('e0000000-0000-0000-0000-000000000002', 'x')`, "no escribe instrucciones en eventos ajenos", "deny");
await as("authenticated", A, `update event_payment_info set instructions = 'Efectivo en la arena' where event_id = '${EV}'`, "el organizador edita las instrucciones", "some");
await as("authenticated", A, `insert into event_payment_info (event_id, instructions) values ('e0000000-0000-0000-0000-000000000002', '   ')`, "instrucciones vacías se rechazan", "deny");
console.log("— Categorías: una sola política de lectura (0019)");
await as("authenticated", A, `insert into event_categories (event_id, name, fee_cents) values ('${EV}','Nueva',100)`, "el dueño activo agrega categorías", "some");
await as("authenticated", A, `update event_categories set name = 'Renombrada' where name = 'Nueva'`, "el dueño activo edita categorías", "some");
await as("authenticated", A, `delete from event_categories where name = 'Renombrada'`, "el dueño activo borra categorías", "some");
await as("authenticated", D, `insert into event_categories (event_id, name, fee_cents) values ('${EV}','Intrusa',100)`, "otro organizador NO agrega categorías a un evento ajeno", "deny");
await as("anon", null, `select name from event_categories where event_id = '${EV}'`, "el público sigue viendo las categorías de eventos publicados", "some");
await as("authenticated", A, `select name from event_categories where event_id = 'e0000000-0000-0000-0000-000000000002'`, "el dueño sigue viendo las categorías de su borrador", "some");
await as("anon", null, `select name from event_categories where event_id = 'e0000000-0000-0000-0000-000000000002'`, "el público NO ve las de un borrador", "deny");
const pol = await db.query("select count(*)::int as n from pg_policies where tablename = 'event_categories' and cmd in ('SELECT','ALL') and 'authenticated' = any(roles::text[]) or (tablename = 'event_categories' and cmd in ('SELECT','ALL') and 'public' = any(roles::text[]))");
console.log("políticas que leen event_categories para authenticated:", pol.rows[0].n);
console.log("— Participante");
await as("authenticated", C, "select phone_e164 from roper_contacts", "ve SOLO su propio contacto (1)", "some");
await as("authenticated", C, "select organizer_verified from profiles", "ve su perfil (1)", "some");
await as("authenticated", C, "update ropers set avatar_path='mi/foto.jpg' where user_id = '" + C + "'", "NO edita ropers por user_id (columna oculta)", "deny");
await as("authenticated", C, "update ropers set avatar_path='mi/foto.jpg' where id = '11111111-0000-0000-0000-000000000001'", "SÍ cambia la foto de SU perfil", "some");
await as("authenticated", B, "update ropers set avatar_path='hack.jpg' where id = '11111111-0000-0000-0000-000000000001'", "NO cambia la foto de otra persona", "deny");
await as("authenticated", C, "insert into profiles (user_id, role, display_name) values ('" + C + "', 'organizador', 'x')", "NO se hace organizador (ya tiene perfil / rol)", "deny");

// Comprobación de un valor concreto (no solo permitido o denegado).
async function check(label, cond) {
  if (!cond) failures++;
  console.log(`${cond ? "✔" : "✘ FALLO"}  ${label.padEnd(58)} → ${cond ? "ok" : "no se cumple"}`);
}

console.log("- Tokens de la app (0011, 0025)");
await as("service_role", null, `select create_device_token('${A}', 'hash-uno', 'Equipo uno')`, "el servidor crea el token de un equipo", "some");
await as("service_role", null, `select create_device_token('${A}', 'hash-dos', 'Equipo dos')`, "el servidor crea el de otro equipo (el primero sigue activo)", "some");
{
  const r = await db.query(`select count(*) filter (where revoked_at is null)::int as activos from api_tokens where organizer_id = '${A}'`);
  await check("quedan 2 tokens activos (uno por equipo)", r.rows[0].activos === 2);
}
await as("authenticated", A, "select id, created_at, last_used_at, revoked_at from api_tokens", "el organizador ve las fechas de SUS tokens", "some");
await as("authenticated", A, "select token_hash from api_tokens", "NO ve el hash de sus tokens", "deny");
await as("authenticated", B, "select id from api_tokens", "NO ve tokens de otro organizador", "deny");
await as("authenticated", A, `update api_tokens set revoked_at = null where organizer_id = '${A}'`, "NO reactiva ni edita tokens directo", "deny");
await as("authenticated", A, `insert into api_tokens (organizer_id, token_hash) values ('${A}', 'x')`, "NO crea tokens directo", "deny");
await as("authenticated", A, `select create_device_token('${A}', 'x', 'y')`, "NO crea tokens con la función (solo el servidor)", "deny");
await as("anon", null, "select id from api_tokens", "anónimo NO ve tokens", "deny");
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

console.log("- Participantes de UN evento para la app (0020)");
{
  const EX = "e1000000-0000-0000-0000-000000000001", EY = "e1000000-0000-0000-0000-000000000002";
  const P1 = "51000000-0000-0000-0000-000000000001", P2 = "51000000-0000-0000-0000-000000000002", P3 = "51000000-0000-0000-0000-000000000003";
  const P4 = "51000000-0000-0000-0000-000000000004", P5 = "51000000-0000-0000-0000-000000000005";
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug) values ('${EX}','Evento X','${A}','publicado','x-0020'), ('${EY}','Evento Y','${A}','publicado','y-0020');
    insert into ropers (id, full_name, updated_at) values
      ('${P1}','Ana Uno','2026-11-01 10:00+00'), ('${P2}','Beto Dos','2026-11-01 12:00+00'), ('${P3}','Cata Tres','2026-11-01 09:00+00'), ('${P5}','Eva Cinco','2026-11-01 09:00+00');
    insert into ropers (id, full_name, merged_into, updated_at) values ('${P4}','Dani Cuatro','${P1}','2026-11-01 09:00+00');
    insert into roper_contacts (roper_id, email, claimed, updated_at) values
      ('${P1}','ana1@x.com',true,'2026-11-01 10:00+00'), ('${P2}','beto@x.com',false,'2026-11-01 12:00+00'), ('${P5}','eva@x.com',false,'2026-11-01 09:00+00');
    insert into roper_ratings (roper_id, discipline, rating, events_count, wins, updated_at) values ('${P1}','lazo',9.4,18,6,'2026-11-02 10:00+00');
    insert into registrations (event_id, roper_id, created_at) values
      ('${EX}','${P1}','2026-11-01 11:00+00'), ('${EX}','${P2}','2026-11-01 12:00+00'), ('${EX}','${P3}','2026-11-03 09:00+00'), ('${EX}','${P4}','2026-11-01 09:00+00'),
      ('${EY}','${P5}','2026-11-01 09:00+00'), ('${EY}','${P1}','2026-11-01 09:00+00');
  `);
  const people = async (event, since = "null", snapshot = "'2026-12-01+00'", after = "null, null", limit = 200) => {
    await db.exec("reset role; set role service_role");
    const r = await db.query(`select global_id, name, email, claimed, changed_at, ratings from public.app_event_participants('${event}', ${since}, ${snapshot}, ${after}, ${limit})`);
    await db.exec("reset role");
    return r.rows;
  };
  const names = (rows) => rows.map((x) => x.name);

  const all = await people(EX);
  await check("solo los inscritos de ESE evento, en orden estable", JSON.stringify(names(all)) === JSON.stringify(["Beto Dos", "Ana Uno", "Cata Tres"]));
  await check("no incluye a quien solo está en otro evento ni a un perfil fusionado", !names(all).includes("Eva Cinco") && !names(all).includes("Dani Cuatro"));
  await check("el otro evento devuelve solo a los suyos", JSON.stringify(names(await people(EY))) === JSON.stringify(["Eva Cinco", "Ana Uno"]) );
  await check("un evento sin inscritos o inexistente devuelve vacío", (await people("e1000000-0000-0000-0000-0000000000ff")).length === 0);
  const ana = all.find((x) => x.name === "Ana Uno"), cata = all.find((x) => x.name === "Cata Tres"), beto = all.find((x) => x.name === "Beto Dos");
  await check("correo y estado de reclamo", ana.email === "ana1@x.com" && ana.claimed === true && cata.email === null && cata.claimed === false);
  await check("ratings por modalidad con su fecha; sin rating queda vacío", ana.ratings.lazo.rating === 9.4 && ana.ratings.lazo.events === 18 && ana.ratings.lazo.wins === 6 && !!ana.ratings.lazo.updated_at && Object.keys(beto.ratings).length === 0);
  await check("la respuesta no trae celular ni ids internos de cuenta", !Object.keys(ana).some((k) => /phone|user_id/.test(k)));
  await check("since filtra por el último cambio (perfil, contacto, rating o inscripción)", JSON.stringify(names(await people(EX, "'2026-11-02 00:00+00'"))) === JSON.stringify(["Ana Uno", "Cata Tres"]));
  await check("el corte (snapshot) deja fuera lo posterior", JSON.stringify(names(await people(EX, "null", "'2026-11-02 12:00+00'"))) === JSON.stringify(["Beto Dos", "Ana Uno"]));
  const page1 = await people(EX, "null", "'2026-12-01+00'", "null, null", 2);
  await check("la primera página respeta el límite", page1.length === 2);
  const last = page1[1];
  const page2 = await people(EX, "null", "'2026-12-01+00'", `'${new Date(last.changed_at).toISOString()}', '${last.global_id}'`, 2);
  await check("el cursor continúa sin repetir ni saltarse a nadie", JSON.stringify(names(page1.concat(page2))) === JSON.stringify(["Beto Dos", "Ana Uno", "Cata Tres"]));

  // Cambiar el estado de un contacto (por ejemplo al reclamar el perfil) mueve su fecha de cambio y vuelve a entrar en la sincronización.
  const before = new Date(beto.changed_at).getTime();
  await db.exec(`update roper_contacts set claimed = true where roper_id = '${P2}'`);
  const after = (await people(EX)).find((x) => x.name === "Beto Dos");
  await check("reclamar el perfil cuenta como cambio del participante", after.claimed === true && new Date(after.changed_at).getTime() > before);

  await as("anon", null, `select * from public.app_event_participants('${EX}', null, now(), null, null, 10)`, "anónimo NO la ejecuta", "deny");
  await as("authenticated", A, `select * from public.app_event_participants('${EX}', null, now(), null, null, 10)`, "un organizador NO la ejecuta desde la API pública", "deny");
  await as("authenticated", C, `select * from public.app_event_participants('${EX}', null, now(), null, null, 10)`, "un participante NO la ejecuta", "deny");
  await as("service_role", null, `select * from public.app_event_participants('${EX}', null, now(), null, null, 10)`, "el servidor SÍ la ejecuta", "some");
}

console.log("- Resultados que sube la app (0021)");
{
  // Los ejemplos del contrato (docs/sync-examples) son los datos de prueba: aquí se comprueba que la base responde lo que dicen.
  const example = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../docs/sync-examples/${name}`, import.meta.url)), "utf8"));
  const request = example("resultados.request.json"), expected = example("resultados.response.json");
  const correction = example("resultados.correccion.request.json"), correctionExpected = example("resultados.correccion.response.json");
  const EV = request.results[0].event_id, EV_OTHER = "f7d1b9a0-1111-4222-8333-444455556666";
  const R1 = request.results[0].roper_global_id, R2 = request.results[1].roper_global_id;
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug) values ('${EV}','Evento resultados','${A}','publicado','res-0021'), ('${EV_OTHER}','Evento de otro','${B}','publicado','otro-0021');
    insert into ropers (id, full_name) values ('${R1}','Lazador Uno'), ('${R2}','Lazador Dos');
  `);
  const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;
  // Siempre vuelve al rol original, aunque la consulta falle (si no, las comprobaciones siguientes correrían como service_role).
  const asServer = async (sql) => {
    await db.exec("reset role; set role service_role");
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const upload = (organizer, results, active = ["lazo"]) =>
    asServer(`select * from public.app_upload_results('${organizer}', ${sqlText(JSON.stringify(results))}::jsonb, array[${active.map(sqlText).join(",")}]::text[], null)`);
  const close = (organizer, event, expectedCount) => asServer(`select * from public.app_close_event_results('${organizer}', '${event}', ${expectedCount})`).then((r) => r[0]);
  const reopen = (organizer, event, reason) => asServer(`select * from public.app_reopen_event_results('${organizer}', '${event}', ${sqlText(reason)})`).then((r) => r[0]);
  const outcome = (rows) => rows.map((r) => [r.r_status, r.r_code ?? null]);
  const one = (overrides) => ({ ...request.results[0], id: "a1c2e3f4-0000-4000-8000-0000000000ff", ...overrides });
  const count = async (sql) => (await db.query(sql)).rows[0].n;

  // 1) El ejemplo del contrato: lo que la base responde es lo que el ejemplo dice (por resultado y en orden).
  const first = await upload(A, request.results);
  await check("ejemplo del contrato: estado y motivo de cada resultado", JSON.stringify(first.map((r) => [r.r_id, r.r_status, r.r_code ?? null, r.r_revision, r.r_retry]))
    === JSON.stringify(expected.results.map((r) => [r.id, r.status, r.code ?? null, r.revision ?? null, r.retry ?? false])));
  await check("lo aceptado quedó guardado (3) y lo rechazado no", (await count(`select count(*)::int as n from event_results where event_id = '${EV}'`)) === 3);
  const unlinked = (await db.query(`select roper_id, participant_name, place from event_results where id = '${request.results[3].id}'`)).rows[0];
  await check("sin lazador en la web: se guarda solo para el evento, con el nombre y sin ligarlo a nadie", unlinked.roper_id === null && unlinked.participant_name === "Chuy Rodríguez" && unlinked.place === 3);
  await check("los resultados sin lazador no tocan ratings ni historial de nadie", (await count("select count(*)::int as n from roper_ratings where roper_id in (select id from ropers where full_name like 'Lazador%')")) === 0
    && (await count(`select count(*)::int as n from event_results where roper_id is not null and event_id = '${EV}'`)) === 2);

  // 2) Idempotencia: reenviar el lote no cambia nada.
  const again = await upload(A, request.results);
  await check("reenviar el mismo lote: sin cambios y nada duplicado", JSON.stringify(outcome(again)) === JSON.stringify([["unchanged", null], ["unchanged", null], ["rejected", "roper_unknown"], ["unchanged", null]])
    && (await count(`select count(*)::int as n from event_results where event_id = '${EV}'`)) === 3);

  // 3) Correcciones con revision mayor; una revision vieja no pisa la nueva.
  const fixed = await upload(A, correction.results);
  await check("corrección del contrato (revision 2): updated", fixed[0].r_status === correctionExpected.results[0].status && fixed[0].r_revision === correctionExpected.results[0].revision);
  await check("la corrección cambió el castigo y la revisión", JSON.stringify((await db.query(`select penalty_ms, revision from event_results where id = '${correction.results[0].id}'`)).rows[0]) === JSON.stringify({ penalty_ms: 0, revision: 2 }));
  const stale = await upload(A, [request.results[1]]);
  await check("un reenvío viejo con datos distintos se rechaza (stale_revision)", stale[0].r_status === "rejected" && stale[0].r_code === "stale_revision" && stale[0].r_retry === false);

  // 4) Evento ajeno, inexistente y validaciones: cada resultado se juzga solo.
  const foreign = await upload(A, [one({ event_id: EV_OTHER }), one({ event_id: "e7d1b9a0-1111-4222-8333-0000000000aa" })]);
  await check("evento de otro organizador o inexistente: se ven igual (event_not_found)", foreign.every((r) => r.r_code === "event_not_found") && foreign[0].r_message === foreign[1].r_message);
  const bad = await upload(A, [
    one({ id: "no-es-uuid" }), one({ time_ms: -5 }), one({ penalty_ms: -1 }), one({ time_ms: 8420.5 }), one({ place: 0 }),
    one({ disqualified: true, place: 1 }), one({ roper_global_id: null, participant_name: null }), one({ roper_global_id: null, participant_name: "x".repeat(121) }),
    one({ discipline: "" }), one({ revision: 0 }), one({ event_id: "no-es-uuid" }),
  ]);
  await check("campos inválidos: cada uno se rechaza como invalid_field sin tirar a los demás", bad.length === 11 && bad.every((r) => r.r_status === "rejected" && r.r_code === "invalid_field" && r.r_retry === false));
  const disc = await upload(A, [one({ discipline: "barriles" })]);
  await check("modalidad inactiva: discipline_inactive", disc[0].r_code === "discipline_inactive");
  const mixed = await upload(A, [one({ time_ms: -5 }), one({ id: "a1c2e3f4-0000-4000-8000-0000000000fe", roper_global_id: R1, time_ms: 7000, place: 4 })]);
  await check("un resultado malo no impide guardar el siguiente", mixed[0].r_status === "rejected" && mixed[1].r_status === "accepted");
  await check("más de 200 resultados en un lote se rechaza completo", await upload(A, Array.from({ length: 201 }, () => one())).then(() => false, () => true));
  const uploadsLog = (await db.query(`select received, accepted, unchanged, updated, rejected from result_uploads where organizer_id = '${A}' order by created_at`)).rows;
  await check("cada lote quedó en la bitácora con sus cantidades", uploadsLog.length > 0 && JSON.stringify(uploadsLog[0]) === JSON.stringify({ received: 4, accepted: 3, unchanged: 0, updated: 0, rejected: 1 }));

  // 5) Cierre: cuenta lo recibido, es idempotente y solo del dueño.
  const total = await count(`select count(*)::int as n from event_results where event_id = '${EV}'`);
  const incomplete = await close(A, EV, total - 1);
  await check("cerrar con otra cantidad: incomplete y NO se cierra", incomplete.outcome === "incomplete" && incomplete.results_count === total && (await count(`select count(*)::int as n from events where id = '${EV}' and results_closed_at is null`)) === 1);
  await check("cerrar un evento ajeno o inexistente: not_found", (await close(B, EV, total)).outcome === "not_found" && (await close(A, "e7d1b9a0-1111-4222-8333-0000000000aa", 0)).outcome === "not_found");
  const closed = await close(A, EV, total);
  await check("cerrar con la cantidad correcta: closed", closed.outcome === "closed" && closed.results_count === total);
  await check("el evento queda finalizado y con el candado puesto", (await count(`select count(*)::int as n from events where id = '${EV}' and status = 'finalizado' and results_closed_at is not null`)) === 1);
  await check("cerrar otra vez es inofensivo: already_closed", (await close(A, EV, total)).outcome === "already_closed");

  // 6) Evento cerrado: lo idéntico se acepta como sin cambios; lo nuevo o distinto se rechaza.
  const locked = await upload(A, [request.results[0], { ...correction.results[0], revision: 3, penalty_ms: 1000 }, one({ id: "a1c2e3f4-0000-4000-8000-0000000000fd", roper_global_id: R2, time_ms: 6000 })]);
  await check("cerrado: igual = unchanged; distinto o nuevo = event_closed", JSON.stringify(outcome(locked)) === JSON.stringify([["unchanged", null], ["rejected", "event_closed"], ["rejected", "event_closed"]]));

  // 7) Reabrir: motivo obligatorio, quita el candado y NO cambia el estado (así nadie puede inscribirse).
  await check("reabrir sin motivo suficiente: reason_required y sigue cerrado", (await reopen(A, EV, "  ya  ")).outcome === "reason_required" && (await count(`select count(*)::int as n from events where id = '${EV}' and results_closed_at is not null`)) === 1);
  await check("reabrir un evento ajeno: not_found", (await reopen(B, EV, "motivo suficiente")).outcome === "not_found");
  const reopened = await reopen(A, EV, "Corregí un castigo mal capturado en la segunda corrida");
  await check("reabrir con motivo: reopened", reopened.outcome === "reopened");
  await check("reabrir NO cambia el estado: sigue finalizado (nadie puede inscribirse) y el candado se quita", (await count(`select count(*)::int as n from events where id = '${EV}' and status = 'finalizado' and results_closed_at is null`)) === 1);
  await check("reabrir uno ya abierto es inofensivo: already_open", (await reopen(A, EV, "otro motivo suficiente")).outcome === "already_open");
  const afterReopen = await upload(A, [{ ...correction.results[0], revision: 3, penalty_ms: 1000 }]);
  await check("con el candado quitado la corrección se acepta", afterReopen[0].r_status === "updated" && afterReopen[0].r_revision === 3);
  await check("la bitácora guarda el cierre y la reapertura con su motivo", JSON.stringify((await db.query(`select action, reason from event_results_log where event_id = '${EV}' order by created_at, action`)).rows.map((r) => [r.action, r.reason]))
    === JSON.stringify([["close", null], ["reopen", "Corregí un castigo mal capturado en la segunda corrida"]]));

  // 8) Permisos: solo el servidor escribe; la lectura de resultados sigue siendo pública.
  for (const [role, uid, label] of [["anon", null, "anónimo"], ["authenticated", A, "un organizador"], ["authenticated", C, "un participante"]]) {
    await as(role, uid, `select * from public.app_upload_results('${A}', '[]'::jsonb, array['lazo'], null)`, `${label} NO sube resultados`, "deny");
    await as(role, uid, `select * from public.app_close_event_results('${A}', '${EV}', 0)`, `${label} NO cierra eventos por la API pública`, "deny");
    await as(role, uid, `select * from public.app_reopen_event_results('${A}', '${EV}', 'motivo suficiente')`, `${label} NO reabre por la API pública`, "deny");
  }
  await as("authenticated", A, `insert into event_results (id, event_id, roper_id, discipline, disqualified) values (gen_random_uuid(), '${EV}', '${R1}', 'lazo', false)`, "un organizador NO escribe resultados directo", "deny");
  await as("authenticated", A, `update event_results set time_ms = 1 where event_id = '${EV}'`, "un organizador NO edita resultados directo", "deny");
  await as("authenticated", A, `delete from event_results where event_id = '${EV}'`, "un organizador NO borra resultados directo", "deny");
  await as("authenticated", A, `update events set results_closed_at = null where id = '${EV}'`, "un organizador NO quita el candado por su cuenta", "deny");
  await as("anon", null, `select id, discipline, time_ms, participant_name from event_results where event_id = '${EV}'`, "los resultados siguen siendo públicos", "some");
  await as("authenticated", A, `select action from event_results_log where event_id = '${EV}'`, "el organizador ve la bitácora de SU evento", "some");
  await as("authenticated", B, `select action from event_results_log where event_id = '${EV}'`, "otro organizador NO ve esa bitácora", "deny");
  await as("anon", null, "select id from result_uploads", "anónimo NO ve las subidas", "deny");
  await as("service_role", null, `select * from public.app_close_event_results('${A}', '${EV}', 0)`, "el servidor SÍ ejecuta las funciones", "some");

  // 9) Resumen con rondas por dentro (0022): contadores derivados, orden estable, validación y correcciones de una ronda.
  console.log("- Resumen con rondas por dentro (0022)");
  const rid = (n) => `a1c2e3f4-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
  const round = (r, status, time, extra = {}) => ({ round: r, stage: "preliminary", status, time_ms: status === "completed" ? time : null, penalty_ms: 0, ...extra });
  const withRounds = (n, rounds, extra = {}) => ({ ...one({ id: rid(n), roper_global_id: R1, place: 5, time_ms: 17000, penalty_ms: 0, completed_runs: undefined, nt_count: undefined, dq_count: undefined }), rounds, ...extra });
  const stored = async (n) => (await db.query(`select rounds, completed_runs, nt_count, dq_count, revision from event_results where id = '${rid(n)}'`)).rows[0];
  const flat = (rounds) => rounds.map((x) => [x.round, x.stage, x.status, x.time_ms, x.penalty_ms]);

  const ok = await upload(A, [withRounds(1, [round(1, "completed", 8000), round(2, "no_time"), round(3, "completed", 9000)])]);
  await check("con rondas y sin contadores: se acepta", ok[0].r_status === "accepted");
  const row1 = await stored(1);
  await check("los contadores salen de las rondas (2 completadas, 1 no time, 0 descalificaciones)", row1.completed_runs === 2 && row1.nt_count === 1 && row1.dq_count === 0);
  await check("un no time cuenta como intento fallido y se guarda sin tiempo", JSON.stringify(flat(row1.rounds)) === JSON.stringify([[1, "preliminary", "completed", 8000, 0], [2, "preliminary", "no_time", null, 0], [3, "preliminary", "completed", 9000, 0]]));

  const shuffled = await upload(A, [withRounds(2, [{ ...round(1, "completed", 7000), stage: "final" }, round(2, "completed", 7100), round(1, "completed", 7200)])]);
  await check("las rondas se guardan ordenadas (preliminares y luego la final)", shuffled[0].r_status === "accepted"
    && JSON.stringify(flat((await stored(2)).rounds)) === JSON.stringify([[1, "preliminary", "completed", 7200, 0], [2, "preliminary", "completed", 7100, 0], [1, "final", "completed", 7000, 0]]));
  const reordered = await upload(A, [withRounds(2, [round(2, "completed", 7100), { ...round(1, "completed", 7000), stage: "final" }, round(1, "completed", 7200)])]);
  await check("reenviar las mismas rondas en otro orden: unchanged", reordered[0].r_status === "unchanged");

  const fixedRound = await upload(A, [withRounds(1, [round(1, "completed", 8000), round(2, "completed", 8100), round(3, "completed", 9000)], { revision: 2 })]);
  await check("corregir una ronda (el no time pasó a tener tiempo): updated y contadores nuevos", fixedRound[0].r_status === "updated" && fixedRound[0].r_revision === 2
    && (await stored(1)).completed_runs === 3 && (await stored(1)).nt_count === 0);
  const sameRevision = await upload(A, [withRounds(1, [round(1, "completed", 8000), round(2, "completed", 8100), round(3, "completed", 9500)], { revision: 2 })]);
  await check("otra ronda distinta con la misma revisión: stale_revision", sameRevision[0].r_code === "stale_revision");

  const badRounds = (n, rounds, extra = {}) => withRounds(n, rounds, extra);
  const invalid = await upload(A, [
    badRounds(11, [round(1, "pending", null)]), badRounds(12, [{ ...round(1, "completed", null), time_ms: null }]), badRounds(13, [{ ...round(1, "no_time", null), time_ms: 5000 }]),
    badRounds(14, [round(1, "completed", 8000, { penalty_ms: -1 })]), badRounds(15, [round(1, "completed", 8000), round(1, "no_time")]), badRounds(16, [round(0, "completed", 8000)]),
    badRounds(17, Array.from({ length: 101 }, (_, i) => round(i + 1, "completed", 8000))), badRounds(18, [round(1, "completed", 8000, { stage: "semifinal" })]),
    badRounds(19, "no es una lista"), badRounds(20, [42]), badRounds(21, [round(1, "completed", 8000)], { completed_runs: 2 }), badRounds(22, [round(1, "no_time")], { nt_count: 0 }),
    badRounds(23, [round(1, "completed", 8000)], { dq_count: 1 }), badRounds(24, [round(1, "completed", 8000, { time_ms: 8000.5 })]),
  ]);
  await check("rondas inválidas o contadores que no coinciden: cada una se rechaza como invalid_field", invalid.length === 14 && invalid.every((r) => r.r_status === "rejected" && r.r_code === "invalid_field" && r.r_retry === false));
  await check("lo rechazado no dejó nada guardado", (await count("select count(*)::int as n from event_results where id::text like 'a1c2e3f4-0000-4000-8000-0000000001%' and id::text > '" + rid(10) + "'")) === 0);
  // Lazada Sorteada (0047): un lazador corre tantos tiros como paquetes compró, así que el tope subió de 20 a 100 rondas por resultado.
  const hundred = await upload(A, [withRounds(30, Array.from({ length: 100 }, (_, i) => round(i + 1, "completed", 8000 + i)))]);
  await check("100 rondas es el máximo permitido (Lazada Sorteada)", hundred[0].r_status === "accepted" && (await stored(30)).completed_runs === 100);
  const lazada = (n, extra = {}) => withRounds(n, Array.from({ length: 6 }, (_, i) => round(i + 1, "completed", 8000 + i)), extra);
  const lz = async (n) => (await db.query(`select packages, shots, revision from event_results where id = '${rid(n)}'`)).rows[0];
  const withPk = await upload(A, [lazada(90, { packages: 3, shots: 6 })]);
  await check("paquetes y tiros opcionales se guardan", withPk[0].r_status === "accepted" && (await lz(90)).packages === 3 && (await lz(90)).shots === 6);
  const withoutPk = await upload(A, [lazada(91)]);
  await check("sin paquetes ni tiros (Round Robin o una app anterior): quedan en NULL", withoutPk[0].r_status === "accepted" && (await lz(91)).packages === null && (await lz(91)).shots === null);
  const sameAgain = await upload(A, [lazada(90, { packages: 3, shots: 6 })]);
  await check("reenviar lo mismo con paquetes y tiros: unchanged", sameAgain[0].r_status === "unchanged");
  const fixedPk = await upload(A, [lazada(90, { packages: 4, shots: 8, revision: 2 })]);
  await check("corregir los paquetes: updated", fixedPk[0].r_status === "updated" && (await lz(90)).packages === 4 && (await lz(90)).shots === 8);
  const badPk = await upload(A, [lazada(92, { packages: 0 }), lazada(93, { packages: 199 }), lazada(94, { shots: 0 }), lazada(95, { shots: 10000 }), lazada(96, { packages: 1.5 })]);
  await check("paquetes o tiros fuera de rango: invalid_field", badPk.length === 5 && badPk.every((r) => r.r_status === "rejected" && r.r_code === "invalid_field"));

  // Sin rondas también se acepta (solo el resumen); si luego llegan rondas con revisión mayor, se completan.
  const summaryOnly = await upload(A, [{ ...one({ id: rid(40), roper_global_id: R2 }), completed_runs: 3, nt_count: 0, dq_count: 0, rounds: undefined }]);
  await check("solo el resumen, sin rondas: se acepta y las rondas quedan vacías", summaryOnly[0].r_status === "accepted" && (await stored(40)).rounds === null);
  const completed = await upload(A, [{ ...one({ id: rid(40), roper_global_id: R2 }), completed_runs: 3, nt_count: 0, dq_count: 0, revision: 2,
    rounds: [round(1, "completed", 8000), round(2, "completed", 8000), round(3, "completed", 8000)] }]);
  await check("llegan las rondas con revisión mayor: se completa el mismo resultado", completed[0].r_status === "updated" && (await stored(40)).rounds.length === 3);

  // 10) Desempate, extras, ayudas y sustituciones (0023): se muestran, pero solo las rondas regulares entran al resumen.
  console.log("- Desempate, extras, ayudas y sustituciones (0023)");
  const flat2 = (rounds) => rounds.map((x) => [x.round, x.stage, x.kind, x.status]);
  const mixedRounds = await upload(A, [withRounds(50, [
    round(1, "completed", 8000), round(2, "completed", 8100),
    { ...round(1, "completed", 7900), stage: "tiebreak" },
    { ...round(2, "completed", 8500), kind: "help" },
    { ...round(1, "no_time"), kind: "extra" },
  ])]);
  const mixed50 = await stored(50);
  await check("desempate, ayuda y extra se aceptan", mixedRounds[0].r_status === "accepted" && mixed50.rounds.length === 5);
  await check("al resumen entran SOLO las rondas regulares preliminares o final (el no time de una extra no cuenta)", mixed50.completed_runs === 2 && mixed50.nt_count === 0 && mixed50.dq_count === 0);
  await check("orden estable: regulares (preliminares y desempate), luego extras y luego ayudas", JSON.stringify(flat2(mixed50.rounds))
    === JSON.stringify([[1, "preliminary", "regular", "completed"], [2, "preliminary", "regular", "completed"], [1, "tiebreak", "regular", "completed"], [1, "preliminary", "extra", "no_time"], [2, "preliminary", "help", "completed"]]));
  const manyExtras = await upload(A, [withRounds(51, [round(1, "completed", 8000), { ...round(1, "completed", 8100), kind: "extra" }, { ...round(1, "no_time"), kind: "extra" }])]);
  await check("las extras pueden repetir número de ronda; las regulares no", manyExtras[0].r_status === "accepted" && (await stored(51)).rounds.length === 3);
  const withCounters = await upload(A, [withRounds(53, [round(1, "completed", 8000), round(2, "completed", 8100), { ...round(2, "completed", 8500), kind: "help" }], { completed_runs: 3 })]);
  await check("si la app cuenta una ayuda en el resumen, no coincide y se rechaza", withCounters[0].r_code === "invalid_field");
  const badKinds = await upload(A, [
    withRounds(54, [{ ...round(1, "completed", 8000), kind: "bonus" }]), withRounds(55, [{ ...round(1, "completed", 8000), stage: "semifinal" }]),
    withRounds(56, [round(1, "completed", 8000), { ...round(1, "completed", 8100), stage: "preliminary" }]),
  ]);
  await check("tipo o etapa desconocidos y una regular repetida: invalid_field", badKinds.every((r) => r.r_code === "invalid_field"));

  const sub = (extra = {}) => ({ role: "heeler", substitute_name: "Beto Sustituto", substitute_global_id: null, counts_for_substitute: false, ...extra });
  const withSub = (n, substitution, extra = {}) => withRounds(n, [round(1, "completed", 8000), { ...round(2, "completed", 8100), substitution }], extra);
  const subbed = await upload(A, [withSub(60, sub({ role: "header", substitute_name: "  Beto Sustituto  ", counts_for_substitute: true }))]);
  const row60 = await stored(60);
  await check("quién corrió en sustitución y si cuenta se guarda dentro de esa ronda (nombre recortado)", subbed[0].r_status === "accepted"
    && JSON.stringify(row60.rounds[1].substitution) === JSON.stringify({ role: "header", substitute_name: "Beto Sustituto", substitute_global_id: null, counts_for_substitute: true }));
  await check("la corrida se queda con el lazador original: los contadores no cambian por la sustitución", row60.completed_runs === 2);
  await check("reenviar la misma sustitución: unchanged", (await upload(A, [withSub(60, sub({ role: "header", substitute_name: "Beto Sustituto", counts_for_substitute: true }))]))[0].r_status === "unchanged");
  const flipped = await upload(A, [withSub(60, sub({ role: "header", substitute_name: "Beto Sustituto", counts_for_substitute: false }), { revision: 2 })]);
  await check("cambiar si cuenta o no para el sustituto es una corrección (updated)", flipped[0].r_status === "updated" && (await stored(60)).rounds[1].substitution.counts_for_substitute === false);
  const subDefaults = await upload(A, [withSub(61, { role: "heeler", substitute_name: "Chuy", substitute_global_id: R2 })]);
  await check("si no se dice si cuenta, es que no; el id del sustituto se guarda", subDefaults[0].r_status === "accepted"
    && (await stored(61)).rounds[1].substitution.counts_for_substitute === false && (await stored(61)).rounds[1].substitution.substitute_global_id === R2);
  const nullSub = await upload(A, [withSub(62, null)]);
  await check("sustitución en null equivale a no haberla", nullSub[0].r_status === "accepted" && (await stored(62)).rounds[1].substitution === undefined);
  const badSubs = await upload(A, [
    withSub(63, sub({ role: "roper" })), withSub(64, sub({ substitute_name: "" })), withSub(65, sub({ substitute_name: undefined })),
    withSub(66, sub({ substitute_name: "x".repeat(121) })), withSub(67, sub({ substitute_global_id: "no-uuid" })),
    withSub(68, sub({ counts_for_substitute: "si" })), withSub(69, "no es un objeto"), withSub(70, [1]),
  ]);
  await check("sustituciones inválidas (rol, nombre, id, bandera o forma): cada una se rechaza como invalid_field", badSubs.length === 8 && badSubs.every((r) => r.r_code === "invalid_field" && r.r_retry === false));

  // Lo guardado con el formato de la 0022 (sin `kind`) pasa al formato nuevo con el mismo comando de la migración.
  await db.exec(`insert into event_results (id, event_id, roper_id, discipline, disqualified, rounds) values ('${rid(80)}', '${EV}', '${R1}', 'lazo', false,
    '[{"round":1,"stage":"preliminary","status":"completed","time_ms":8000,"penalty_ms":0}]'::jsonb)`);
  await db.exec("update event_results set rounds = public.app_normalize_rounds(rounds) where rounds is not null");
  await check("el formato viejo se normaliza: aparece kind regular", (await stored(80)).rounds[0].kind === "regular");
}

console.log("- Un token por equipo y vencimiento por inactividad (0025)");
{
  const T1 = "f3000000-0000-0000-0000-0000000000a1", T2 = "f3000000-0000-0000-0000-0000000000b1", T3 = "f3000000-0000-0000-0000-0000000000c1";
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${T1}','t1@x.com',now()), ('${T2}','t2@x.com',now()), ('${T3}','t3@x.com',now());
    insert into profiles (user_id, role, display_name, organizer_verified) values ('${T1}','organizador','Org T1',true), ('${T2}','organizador','Org T2',true), ('${T3}','organizador','Org T3',true);
  `);
  const svc = async (sql, params = []) => { await db.exec("reset role; set role service_role"); const r = await db.query(sql, params); await db.exec("reset role"); return r.rows; };
  const device = async (org, hash, name = "Equipo") => (await svc("select public.create_device_token($1, $2, $3, 3) as id", [org, hash, name]))[0].id;
  const verify = async (hash) => (await svc("select public.verify_api_token($1) as org", [hash]))[0].org;
  const count = async (org, kind) => (await db.query(`select count(*)::int as n from api_tokens where organizer_id = $1 and kind = $2 and revoked_at is null`, [org, kind])).rows[0].n;
  const age = (hash, days, column = "last_used_at") => db.exec(`update api_tokens set ${column} = now() - interval '${days} days' where token_hash = '${hash}'`);

  await check("el vencimiento por inactividad es de 30 días", (await svc("select public.api_token_idle_days() as d"))[0].d === 30);

  // --- límite de equipos
  const d1 = await device(T1, "t1-d1", "MacBook de la oficina"), d2 = await device(T1, "t1-d2"), d3 = await device(T1, "t1-d3");
  await check("un organizador conecta hasta 3 equipos", !!d1 && !!d2 && !!d3 && (await count(T1, "login")) === 3);
  await check("el cuarto equipo NO se crea y no cierra a ninguno (devuelve null)", (await device(T1, "t1-d4")) === null && (await count(T1, "login")) === 3);
  await check("los 3 equipos siguen sirviendo tras el intento del cuarto", (await verify("t1-d1")) === T1 && (await verify("t1-d3")) === T1);
  await check("revocar un equipo libera su lugar: el cuarto ya se crea", (await svc("select public.revoke_api_token($1, $2) as ok", [T1, d2]))[0].ok === true && !!(await device(T1, "t1-d4")));
  await check("un equipo revocado deja de servir al instante", (await verify("t1-d2")) === null);
  await check("otro organizador NO puede revocar un equipo ajeno", (await svc("select public.revoke_api_token($1, $2) as ok", [T2, d1]))[0].ok === false && (await verify("t1-d1")) === T1);
  await check("revocar dos veces el mismo equipo no falla: la segunda devuelve false", (await svc("select public.revoke_api_token($1, $2) as ok", [T1, d2]))[0].ok === false);

  // --- sin códigos manuales (0037, KIN-631)
  await check("rotate_api_token ya no existe: ni el servidor puede crear un código manual", await (async () => { try { await svc("select public.rotate_api_token($1, 'm1')", [T1]); return false; } catch { await db.exec("reset role"); return true; } })());
  // Un código manual que siguiera activo cuando se aplica la migración queda revocado, y los equipos no se tocan.
  await db.query(`insert into api_tokens (organizer_id, token_hash, kind) values ('${T1}', 'manual-viejo', 'manual')`);
  await check("antes de la migración, un código manual activo sí servía", (await verify("manual-viejo")) === T1);
  await db.exec(readFileSync(`${dir}/0037_quitar_codigos_manuales.sql`, "utf8"));
  await check("la migración 0037 revoca los códigos manuales activos", (await verify("manual-viejo")) === null && (await count(T1, "manual")) === 0);
  await check("la migración 0037 no toca a los equipos", (await verify("t1-d1")) === T1 && (await count(T1, "login")) === 3);
  await check("la migración 0037 se puede repetir sin efecto", (await db.exec(readFileSync(`${dir}/0037_quitar_codigos_manuales.sql`, "utf8")), (await verify("t1-d1")) === T1));
  await check("el cuarto equipo sigue sin crearse (los códigos manuales nunca contaron dentro de los 3)", (await device(T1, "t1-d5")) === null);

  // --- nombre del equipo
  await device(T2, "t2-vacio", "   ");
  await device(T2, "t2-largo", "x".repeat(100));
  await device(T2, "t2-espacios", "  Laptop de Ana  ");
  const names = (await db.query(`select token_hash, name from api_tokens where organizer_id = '${T2}'`)).rows.reduce((m, r) => ({ ...m, [r.token_hash]: r.name }), {});
  await check("el nombre vacío queda como Equipo, el largo se corta a 60 y se recortan espacios",
    names["t2-vacio"] === "Equipo" && names["t2-largo"].length === 60 && names["t2-espacios"] === "Laptop de Ana");

  // --- vencimiento por inactividad, con renovación deslizante
  await check("un token desconocido no sirve", (await verify("no-existe")) === null);
  await age("t1-d1", 31);
  await check("a los 31 días sin uso el token vence (401)", (await verify("t1-d1")) === null);
  await age("t1-d3", 29);
  await check("a los 29 días sigue sirviendo", (await verify("t1-d3")) === T1);
  await check("y ese uso reinicia el plazo (last_used_at se renueva)", (await db.query(`select last_used_at > now() - interval '1 minute' as fresh from api_tokens where token_hash = 't1-d3'`)).rows[0].fresh === true);
  const before = (await db.query(`select last_used_at::text as t from api_tokens where token_hash = 't1-d3'`)).rows[0].t;
  await verify("t1-d3");
  await check("last_used_at se escribe como máximo una vez por minuto", (await db.query(`select last_used_at::text as t from api_tokens where token_hash = 't1-d3'`)).rows[0].t === before);
  await db.exec(`insert into api_tokens (organizer_id, token_hash, kind, last_used_at, created_at) values ('${T2}', 'nunca-usado-viejo', 'login', null, now() - interval '31 days'), ('${T2}', 'nunca-usado-nuevo', 'login', null, now() - interval '29 days')`);
  await check("un token nunca usado cuenta desde su creación: a los 31 días vence, a los 29 no", (await verify("nunca-usado-viejo")) === null && (await verify("nunca-usado-nuevo")) === T2);
  await age("m2", 31);
  await check("el código manual también vence a los 30 días sin uso", (await verify("m2")) === null);

  // --- un equipo vencido no ocupa lugar del límite
  await device(T3, "t3-a"); await device(T3, "t3-b"); await device(T3, "t3-c");
  await check("con 3 equipos activos no cabe otro", (await device(T3, "t3-x")) === null);
  await age("t3-a", 31);
  await check("si uno venció por inactividad, su lugar queda libre", !!(await device(T3, "t3-y")));

  // --- cierre de sesión de la app: revoca solo ese token
  await check("cerrar sesión revoca solo el token que se usó", (await svc("select public.revoke_api_token_by_hash($1) as ok", ["t3-b"]))[0].ok === true
    && (await verify("t3-b")) === null && (await verify("t3-c")) === T3);
  await check("cerrar sesión con un token que ya no existe devuelve false, sin error", (await svc("select public.revoke_api_token_by_hash($1) as ok", ["t3-b"]))[0].ok === false);

  // --- permisos: solo el servidor
  for (const [fn, args] of [
    ["create_device_token", `'${T1}', 'x', 'x', 3`], ["verify_api_token", `'x'`], ["revoke_api_token", `'${T1}', '${d1}'`],
    ["revoke_api_token_by_hash", `'x'`], ["api_token_idle_days", ``],
  ]) {
    await as("anon", null, `select public.${fn}(${args})`, `anónimo NO ejecuta ${fn}`, "deny");
    await as("authenticated", T1, `select public.${fn}(${args})`, `un organizador NO ejecuta ${fn}`, "deny");
    await as("service_role", null, `select public.${fn}(${args})`, `el servidor SÍ ejecuta ${fn}`, "some");
  }
  await as("authenticated", T1, "select id, name, kind, created_at, last_used_at, revoked_at from api_tokens", "el organizador ve sus equipos (nombre, tipo y fechas)", "some");
  await as("authenticated", T1, "select token_hash from api_tokens", "NO ve el hash de sus equipos", "deny");
  await as("authenticated", T1, `update api_tokens set revoked_at = null, kind = 'manual' where organizer_id = '${T1}'`, "NO reactiva ni cambia el tipo de un equipo directo", "deny");
  await as("authenticated", T1, `insert into api_tokens (organizer_id, token_hash, kind) values ('${T1}', 'directo', 'login')`, "NO crea equipos directo (se saltaría el límite)", "deny");
  await as("authenticated", T2, `select id from api_tokens where organizer_id = '${T1}'`, "NO ve los equipos de otro organizador", "deny");
}

console.log("- Eventos con inscritos y pagos para la app (0024)");
{
  const E1 = "e2000000-0000-0000-0000-000000000001", E2 = "e2000000-0000-0000-0000-000000000002", E3 = "e2000000-0000-0000-0000-000000000003", E4 = "e2000000-0000-0000-0000-000000000004";
  const K1 = "c2000000-0000-0000-0000-000000000001", K2 = "c2000000-0000-0000-0000-000000000002", K4 = "c2000000-0000-0000-0000-000000000004";
  const R1 = "52000000-0000-0000-0000-000000000001", R2 = "52000000-0000-0000-0000-000000000002", R3 = "52000000-0000-0000-0000-000000000003", R4 = "52000000-0000-0000-0000-000000000004", R5 = "52000000-0000-0000-0000-000000000005";
  const U = "f2000000-0000-0000-0000-00000000000f";
  // Organizadores propios de esta sección: A y B ya tienen otros eventos de las pruebas anteriores.
  const OA = "f2000000-0000-0000-0000-0000000000a1", OB = "f2000000-0000-0000-0000-0000000000b1";
  const tick = () => db.exec("select pg_sleep(0.02)");
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${U}','u24@x.com',now()), ('${OA}','oa24@x.com',now()), ('${OB}','ob24@x.com',now());
    insert into profiles (user_id, role, display_name, organizer_verified) values ('${U}','participante','Participante 24',false), ('${OA}','organizador','Org 24 A',true), ('${OB}','organizador','Org 24 B',true);
    insert into events (id, name, organizer_id, status, slug, event_date, city, venue, capacity) values
      ('${E1}','Evento Uno','${OA}','publicado','e24-1','2026-12-06','Monterrey','Lienzo',100),
      ('${E2}','Borrador Dos','${OA}','borrador','e24-2',null,null,null,null),
      ('${E3}','Finalizado Tres','${OA}','finalizado','e24-3','2026-10-01','Saltillo','Arena',null),
      ('${E4}','Evento Ajeno','${OB}','publicado','e24-4','2026-12-07','Torreón','Plaza',50);
    insert into event_categories (id, event_id, name, fee_cents) values ('${K1}','${E1}','Libre',80000), ('${K2}','${E1}','Segunda fuerza',60000), ('${K4}','${E4}','Abierta',50000);
    insert into ropers (id, full_name) values ('${R1}','Ana Uno'), ('${R2}','Beto Dos'), ('${R4}','Eva Ajena');
    insert into ropers (id, full_name, merged_into) values ('${R3}','Ana Duplicada','${R1}');
    insert into ropers (id, full_name, user_id) values ('${R5}','Uri Participante','${U}');
    insert into registrations (id, event_id, roper_id, category_id, amount_cents, payment_status, payment_method, created_at) values
      ('f1000000-0000-0000-0000-000000000001','${E1}','${R1}','${K1}',80000,'pagado','efectivo','2026-11-01 10:00+00'),
      ('f1000000-0000-0000-0000-000000000002','${E1}','${R2}','${K2}',60000,'pendiente',null,'2026-11-01 11:00+00'),
      ('f1000000-0000-0000-0000-000000000003','${E1}','${R3}','${K1}',80000,'reembolsado','stripe','2026-11-01 12:00+00'),
      ('f1000000-0000-0000-0000-000000000004','${E4}','${R4}','${K4}',50000,'pendiente',null,'2026-11-01 13:00+00');
  `);
  const evts = async (org, { since = null, snapshot = "2099-01-01 00:00+00", after = null, afterId = null, limit = 50 } = {}) => {
    await db.exec("reset role; set role service_role");
    const r = await db.query(`select id, name, status, changed_at::text as changed_text, categories, registrations from public.app_organizer_events($1, $2, $3, $4, $5, $6)`,
      [org, since, snapshot, after, afterId, limit]);
    await db.exec("reset role");
    return r.rows;
  };
  const names = (rows) => rows.map((r) => r.name);

  const mine = await evts(OA);
  await check("el organizador recibe sus eventos publicado y finalizado, no el borrador", JSON.stringify(names(mine).sort()) === JSON.stringify(["Evento Uno", "Finalizado Tres"]));
  await check("nunca recibe eventos de otro organizador", !names(mine).includes("Evento Ajeno") && JSON.stringify(names(await evts(OB))) === JSON.stringify(["Evento Ajeno"]));
  await check("un organizador sin eventos (o inexistente) recibe una lista vacía", (await evts(C)).length === 0);

  const uno = mine.find((e) => e.id === E1);
  await check("el evento trae sus categorías con id, nombre y costo en centavos", JSON.stringify(uno.categories.map((c) => [c.name, c.fee_cents])) === JSON.stringify([["Libre", 80000], ["Segunda fuerza", 60000]]));
  const regs = uno.registrations;
  await check("trae todas sus inscripciones con categoría, estado de pago, monto y método", regs.length === 3
    && regs[0].payment_status === "pagado" && regs[0].payment_method === "efectivo" && regs[0].amount_cents === 80000 && regs[0].category === "Libre"
    && regs[1].payment_status === "pendiente" && regs[1].payment_method === null && regs[1].category === "Segunda fuerza"
    && regs[2].payment_status === "reembolsado" && regs[2].payment_method === "stripe");
  await check("un inscrito con perfil fusionado apunta al perfil vigente (id y nombre)", regs[2].roper_global_id === R1 && regs[2].name === "Ana Uno");
  await check("solo salen las inscripciones de ESE evento", !JSON.stringify(mine).includes("Eva Ajena"));
  await check("cada inscripción solo lleva los campos del contrato (ni correo ni celular ni cuenta)",
    JSON.stringify(Object.keys(regs[0]).sort()) === JSON.stringify(["amount_cents", "category", "category_id", "id", "name", "packages", "payment_method", "payment_status", "role", "roper_global_id"]));
  await check("un evento sin inscritos ni categorías devuelve listas vacías, no null", (() => { const e3 = mine.find((e) => e.id === E3); return Array.isArray(e3.registrations) && e3.registrations.length === 0 && Array.isArray(e3.categories); })());

  // --- since: pagos, inscripciones, cancelaciones y categorías cuentan como cambio del evento
  await tick();
  const t0 = (await db.query("select clock_timestamp()::text as t")).rows[0].t;
  await tick();
  await check("desde ahora no hay cambios", (await evts(OA, { since: t0 })).length === 0);

  await as("authenticated", OA, "select public.set_registration_payment('f1000000-0000-0000-0000-000000000002','transferencia')", "el organizador marca un pago", "some");
  let changed = await evts(OA, { since: t0 });
  await check("marcar un pago hace que SOLO ese evento vuelva a salir, con el pago nuevo",
    JSON.stringify(names(changed)) === JSON.stringify(["Evento Uno"]) && changed[0].registrations[1].payment_status === "pagado" && changed[0].registrations[1].payment_method === "transferencia");

  await tick();
  const t1 = (await db.query("select clock_timestamp()::text as t")).rows[0].t;
  await tick();
  await as("authenticated", U, `select public.register_for_event('${E1}','${K2}')`, "un participante se inscribe (el trigger no estorba a la función de la base)", "some");
  changed = await evts(OA, { since: t1 });
  await check("una inscripción nueva hace que el evento vuelva a salir con ella", changed.length === 1 && changed[0].registrations.length === 4 && changed[0].registrations.some((r) => r.name === "Uri Participante"));

  await tick();
  const t2 = (await db.query("select clock_timestamp()::text as t")).rows[0].t;
  await tick();
  const mineReg = changed[0].registrations.find((r) => r.name === "Uri Participante").id;
  await as("authenticated", U, `select public.cancel_registration('${mineReg}')`, "el participante cancela su inscripción pendiente", "some");
  changed = await evts(OA, { since: t2 });
  await check("una cancelación (borrado) también cuenta: el evento sale sin esa inscripción", changed.length === 1 && changed[0].registrations.length === 3 && !JSON.stringify(changed[0]).includes("Uri Participante"));

  await tick();
  const t3 = (await db.query("select clock_timestamp()::text as t")).rows[0].t;
  await tick();
  await db.exec(`update event_categories set fee_cents = 90000 where id = '${K1}'`);
  changed = await evts(OA, { since: t3 });
  await check("cambiar el costo de una categoría cuenta como cambio del evento", changed.length === 1 && changed[0].categories.find((c) => c.name === "Libre").fee_cents === 90000);

  await tick();
  const t4 = (await db.query("select clock_timestamp()::text as t")).rows[0].t;
  await tick();
  await db.exec(`update ropers set full_name = 'Ana Renombrada' where id = '${R1}'`);
  changed = await evts(OA, { since: t4 });
  await check("cambiar el nombre de un inscrito cuenta como cambio de sus eventos", changed.length === 1 && changed[0].registrations[0].name === "Ana Renombrada");

  await check("el cambio en el evento de otro organizador no mueve los eventos de este", (await evts(OB, { since: t0 })).length === 0);

  // --- paginación por cursor: cada evento una sola vez, en orden estable, sin perder microsegundos
  for (const n of [5, 6, 7]) {
    await db.exec(`insert into events (id, name, organizer_id, status, slug) values ('e2000000-0000-0000-0000-00000000010${n}','Extra ${n}','${OA}','publicado','e24-x${n}')`);
  }
  const everything = await evts(OA);
  const walked = [];
  let after = null, afterId = null, guard = 0;
  while (guard++ < 20) {
    const page = await evts(OA, { after, afterId, limit: 2 });
    walked.push(...page);
    if (page.length < 2) break;
    after = page[page.length - 1].changed_text; afterId = page[page.length - 1].id;
  }
  await check("paginar de 2 en 2 recorre todos los eventos, sin repetir ni saltar", everything.length === 5
    && JSON.stringify(walked.map((r) => r.id)) === JSON.stringify(everything.map((r) => r.id)) && new Set(walked.map((r) => r.id)).size === 5);
  await check("el corte (snapshot) deja fuera lo que cambió después", (await evts(OA, { snapshot: "2000-01-01 00:00+00" })).length === 0);

  // --- borrar un evento (cascada sobre inscripciones y categorías) no debe fallar por el trigger
  let deleted = true;
  try { await db.exec(`delete from events where id = '${E1}'`); } catch { deleted = false; }
  await check("borrar un evento con inscripciones y categorías funciona (cascada con el trigger)", deleted && (await evts(OA)).every((e) => e.id !== E1));

  // --- backfill de la 0024: las inscripciones que ya existían antes del trigger se reenvían UNA vez
  {
    const E5 = "e2000000-0000-0000-0000-000000000005", E6 = "e2000000-0000-0000-0000-000000000006", R6 = "52000000-0000-0000-0000-000000000006";
    await db.exec(`
      insert into ropers (id, full_name) values ('${R6}','Rita Previa');
      insert into events (id, name, organizer_id, status, slug) values ('${E5}','Publicado Previo','${OA}','publicado','e24-5'), ('${E6}','Borrador Previo','${OA}','borrador','e24-6');
      insert into registrations (event_id, roper_id, amount_cents) values ('${E5}','${R6}',1000), ('${E6}','${R6}',1000);
      alter table events disable trigger events_touch;
      alter table ropers disable trigger ropers_touch;
      update events set updated_at = '2026-01-01 00:00+00' where id in ('${E5}','${E6}');
      update ropers set updated_at = '2026-01-01 00:00+00' where id = '${R6}';
      alter table events enable trigger events_touch;
      alter table ropers enable trigger ropers_touch;
    `);
    await check("antes del backfill, un evento con inscritos viejos no sale con un since reciente", !names(await evts(OA, { since: "2026-06-01 00:00+00" })).includes("Publicado Previo"));
    const backfill = readFileSync(`${dir}/0024_eventos_para_la_app.sql`, "utf8").match(/update public\.events e set updated_at = now\(\)[\s\S]*?;/)?.[0];
    await check("la 0024 trae el backfill de las inscripciones existentes", !!backfill);
    await db.exec(backfill);
    await check("después del backfill, el evento publicado con inscritos se reenvía con un since anterior", names(await evts(OA, { since: "2026-06-01 00:00+00" })).includes("Publicado Previo"));
    await check("el borrador con inscritos no se marca ni sale", (await db.query(`select updated_at < '2026-02-01' as old from events where id = '${E6}'`)).rows[0].old === true
      && !names(await evts(OA, { since: "2026-06-01 00:00+00" })).includes("Borrador Previo"));
  }

  const call = `select * from public.app_organizer_events('${A}', null, now(), null, null, 10)`;
  await as("anon", null, call, "anónimo NO la ejecuta", "deny");
  await as("authenticated", A, call, "un organizador NO la ejecuta desde la API pública", "deny");
  await as("authenticated", C, call, "un participante NO la ejecuta", "deny");
  await as("service_role", null, call, "el servidor SÍ la ejecuta", "some");
  await as("authenticated", A, "select public.touch_event_of_child()", "nadie llama al trigger a mano", "deny");
}

console.log("- Ranking público paginado (0026)");
{
  await db.exec(`
    insert into ropers (id, full_name) values
      ('61000000-0000-0000-0000-000000000001','Zrk Beta'), ('61000000-0000-0000-0000-000000000002','Zrk Alfa'),
      ('61000000-0000-0000-0000-000000000003','Zrk Álvaro Gómez'), ('61000000-0000-0000-0000-000000000004','Zrk Cero');
    insert into ropers (id, full_name, merged_into) values ('61000000-0000-0000-0000-000000000005','Zrk Fusionado','61000000-0000-0000-0000-000000000002');
    insert into roper_ratings (roper_id, discipline, rating, events_count, wins) values
      ('61000000-0000-0000-0000-000000000001','lazo',9.0,5,2), ('61000000-0000-0000-0000-000000000002','lazo',9.0,4,1),
      ('61000000-0000-0000-0000-000000000001','barriles',2.0,1,0);
  `);
  // Como anónimo: es la misma vista que tiene la web pública.
  const rank = async (discipline, tokens = null, after = null, limit = 50) => {
    await db.exec("reset role; set role anon");
    try {
      const t = tokens ? `array[${tokens.map((x) => `'${x}'`).join(",")}]::text[]` : "null";
      return (await db.query(`select * from public.public_ranking('${discipline}', 1, ${t}, ${after ?? "null"}, ${limit})`)).rows;
    } finally { await db.exec("reset role"); }
  };
  const names = (rows) => rows.map((r) => r.full_name);

  const all = await rank("lazo", ["zrk"]);
  await check("devuelve a los visibles y deja fuera al perfil fusionado", all.length === 4 && !names(all).includes("Zrk Fusionado"));
  await check("ordena por rating (mayor primero) y, a igual rating, por nombre", JSON.stringify(names(all).slice(0, 2)) === JSON.stringify(["Zrk Alfa", "Zrk Beta"]));
  await check("el lugar crece sin repetirse", all.every((r, i) => i === 0 || Number(r.rank) > Number(all[i - 1].rank)));
  const alfa = all[0], cero = all.find((r) => r.full_name === "Zrk Cero");
  await check("rating, eventos y victorias de quien tiene rating", Number(alfa.rating) === 9 && alfa.events_count === 4 && alfa.wins === 1 && alfa.is_initial === false);
  await check("quien no tiene rating parte del inicial y va después de quien sí lo tiene", Number(cero.rating) === 1 && cero.is_initial === true && cero.events_count === 0 && Number(cero.rank) > Number(all[1].rank));
  const ahead = (await db.query(`
    select count(*)::int as n from ropers p left join roper_ratings rr on rr.roper_id = p.id and rr.discipline = 'lazo'
    where p.merged_into is null and (coalesce(rr.rating, 1) > 9 or (coalesce(rr.rating, 1) = 9 and p.full_name < 'Zrk Beta'))`)).rows[0].n;
  await check("el lugar es sobre TODO el ranking (no solo sobre lo que se ve)", Number(all[1].rank) === ahead + 1);

  await check("la búsqueda ignora acentos y mayúsculas", JSON.stringify(names(await rank("lazo", ["alvaro"]))) === JSON.stringify(["Zrk Álvaro Gómez"]));
  await check("varias palabras: cada una debe empezar alguna palabra del nombre", JSON.stringify(names(await rank("lazo", ["zrk", "alv", "gom"]))) === JSON.stringify(["Zrk Álvaro Gómez"]));
  await check("busca por INICIO de palabra, no por cualquier parte", (await rank("lazo", ["rk"])).length === 0 && (await rank("lazo", ["lvaro"])).length === 0);
  await check("al buscar, cada quien conserva su lugar real", Number((await rank("lazo", ["beta"]))[0].rank) === Number(all[1].rank));
  await check("sin palabras (vacío) no filtra", (await rank("lazo", [])).length === (await rank("lazo", null)).length);

  const p1 = await rank("lazo", ["zrk"], null, 2), p2 = await rank("lazo", ["zrk"], Number(p1[1].rank), 2), p3 = await rank("lazo", ["zrk"], Number(p2[1].rank), 2);
  await check("el cursor continúa sin repetir ni saltarse a nadie", JSON.stringify(names(p1.concat(p2))) === JSON.stringify(names(all)) && p3.length === 0);
  await check("el límite se acota: nunca menos de 1 ni más de 101", (await rank("lazo", ["zrk"], null, 0)).length === 1 && (await rank("lazo", null, null, 100000)).length <= 101);

  const barriles = await rank("barriles", ["zrk"]);
  await check("cada modalidad tiene su propio ranking", Number(barriles[0].rating) === 2 && barriles[0].full_name === "Zrk Beta" && barriles.filter((r) => r.is_initial).length === 3);
  await check("no devuelve celular, correo ni ids de cuenta", !Object.keys(all[0]).some((k) => /phone|email|user_id/.test(k)));

  const call = "select * from public.public_ranking('lazo', 1, null, null, 5)";
  await as("anon", null, call, "anónimo SÍ la ejecuta (el ranking es público)", "some");
  await as("authenticated", C, call, "un participante SÍ la ejecuta", "some");
}

console.log("- Historial y resumen del lazador (0027)");
{
  const EV = (n) => `e7000000-0000-0000-0000-00000000000${n}`, RP = (n) => `67000000-0000-0000-0000-00000000000${n}`, RS = (n) => `a7000000-0000-0000-0000-00000000000${n}`;
  const rounds1 = JSON.stringify([
    { round: 1, stage: "preliminary", kind: "regular", status: "completed", time_ms: 6000, penalty_ms: 0 },
    { round: 2, stage: "preliminary", kind: "regular", status: "completed", time_ms: 9000, penalty_ms: 3000 },
  ]);
  const rounds2 = JSON.stringify([
    { round: 1, stage: "preliminary", kind: "regular", status: "completed", time_ms: 5400, penalty_ms: 0 },
    { round: 1, stage: "preliminary", kind: "extra", status: "completed", time_ms: 4000, penalty_ms: 0 },
    { round: 2, stage: "final", kind: "regular", status: "no_time", time_ms: null, penalty_ms: 0 },
  ]);
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date) values
      ('${EV(1)}','Hist Evento Uno','${A}','publicado','hist-1','2026-10-01'), ('${EV(2)}','Hist Evento Dos','${A}','finalizado','hist-2','2026-10-10'),
      ('${EV(3)}','Hist Borrador','${A}','borrador','hist-3','2026-10-20'), ('${EV(5)}','Hist Evento Cinco','${A}','finalizado','hist-5','2026-09-15');
    insert into ropers (id, full_name) values ('${RP(1)}','Hist Uno'), ('${RP(2)}','Hist Dos');
    insert into event_results (id, event_id, roper_id, discipline, time_ms, penalty_ms, disqualified, place, rounds) values
      ('${RS(1)}','${EV(1)}','${RP(1)}','lazo',18000,3000,false,3,'${rounds1}'::jsonb),
      ('${RS(2)}','${EV(2)}','${RP(1)}','lazo',17000,0,false,1,'${rounds2}'::jsonb),
      ('${RS(3)}','${EV(3)}','${RP(1)}','lazo',16000,0,false,1,null),
      ('${RS(4)}','${EV(1)}','${RP(2)}','lazo',20000,0,false,5,null),
      ('${RS(6)}','${EV(5)}','${RP(1)}','lazo',null,0,true,null,null);
    insert into event_results (id, event_id, roper_id, participant_name, discipline, time_ms, penalty_ms, disqualified, place) values
      ('${RS(5)}','${EV(2)}',null,'Invitado Hist','lazo',15000,0,false,2);
  `);
  const asAnon = async (sql) => {
    await db.exec("reset role; set role anon");
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const hist = (roper, date = null, id = null, limit = 20) =>
    asAnon(`select * from public.public_roper_results('${roper}', ${date ? `'${date}'` : "null"}, ${id ? `'${id}'` : "null"}, ${limit})`);
  const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const nameOf = (rows) => rows.map((r) => r.event_name);

  const all = await hist(RP(1));
  await check("el historial va del evento más reciente al más antiguo", JSON.stringify(nameOf(all)) === JSON.stringify(["Hist Evento Dos", "Hist Evento Uno", "Hist Evento Cinco"]));
  await check("no salen resultados de un borrador, de otro lazador ni de gente sin lazador", all.length === 3);
  await check("cada fila trae evento, fecha, tiempo, castigo y lugar", all[1].event_slug === "hist-1" && day(all[1].event_date) === "2026-10-01" && all[1].time_ms === 18000 && all[1].penalty_ms === 3000 && all[1].place === 3);
  await check("un descalificado sale marcado y sin lugar", all[2].disqualified === true && all[2].place === null && all[2].time_ms === null);
  await check("avisa si el resultado trae rondas, sin enviarlas", all[0].has_rounds === true && all[2].has_rounds === false && !("rounds" in all[0]));

  const p1 = await hist(RP(1), null, null, 2), last = p1[1];
  const p2 = await hist(RP(1), day(last.event_date), last.id, 2), p3 = await hist(RP(1), day(p2[p2.length - 1].event_date), p2[p2.length - 1].id, 2);
  await check("el cursor continúa sin repetir ni saltarse a nadie", JSON.stringify(nameOf(p1.concat(p2))) === JSON.stringify(nameOf(all)) && p3.length === 0);
  await check("el límite se acota: nunca menos de 1", (await hist(RP(1), null, null, 0)).length === 1);
  await check("un lazador sin resultados devuelve vacío", (await hist("67000000-0000-0000-0000-0000000000ff")).length === 0);

  const sum = async (roper) => (await asAnon(`select * from public.public_roper_summary('${roper}')`))[0];
  const s1 = await sum(RP(1));
  await check("resumen: resultados, eventos, victorias y mejor lugar (sin contar descalificados ni borradores)", s1.results_count === 3 && s1.events_count === 3 && s1.wins === 1 && s1.best_place === 1);
  await check("resumen: mejor corrida regular por modalidad (ignora extras y no time; suma castigos)", JSON.stringify(s1.best_runs) === JSON.stringify({ lazo: 5400 }));
  const s2 = await sum(RP(2)), s0 = await sum("67000000-0000-0000-0000-0000000000ff");
  await check("resumen de otro lazador: solo lo suyo", s2.results_count === 1 && s2.wins === 0 && s2.best_place === 5 && JSON.stringify(s2.best_runs) === "{}");
  await check("resumen sin resultados: ceros", s0.results_count === 0 && s0.events_count === 0 && s0.wins === 0 && s0.best_place === null && JSON.stringify(s0.best_runs) === "{}");

  await as("anon", null, `select * from public.public_roper_results('${RP(1)}')`, "anónimo SÍ ve el historial (es público)", "some");
  await as("authenticated", C, `select * from public.public_roper_summary('${RP(1)}')`, "un participante SÍ ve el resumen", "some");
  await as("anon", null, `select rounds from event_results where id = '${RS(2)}'`, "las rondas de un resultado se piden aparte, por su id", "some");
  await as("anon", null, `select er.rounds from event_results er join events e on e.id = er.event_id where er.id = '${RS(3)}'`, "las rondas de un evento en borrador NO se ven (como las pide la web)", "deny");
}

console.log("- Inscritos de un evento (0028)");
{
  const EV = (n) => `e8000000-0000-0000-0000-00000000000${n}`, RP = (n) => `68000000-0000-0000-0000-00000000000${n}`;
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug) values
      ('${EV(1)}','Ins Evento','${A}','publicado','ins-1'), ('${EV(2)}','Ins Borrador','${A}','borrador','ins-2'), ('${EV(3)}','Ins Otro','${A}','publicado','ins-3');
    insert into ropers (id, full_name, avatar_path) values
      ('${RP(1)}','Ins Uno','a/uno.jpg'), ('${RP(2)}','Ins Dos',null), ('${RP(3)}','Ins Tres',null), ('${RP(4)}','Ins Cuatro',null);
    insert into ropers (id, full_name, merged_into) values ('${RP(5)}','Ins Fusionado','${RP(1)}');
    insert into roper_ratings (roper_id, discipline, rating, events_count, wins) values ('${RP(1)}','lazo',8.5,6,2), ('${RP(2)}','barriles',3.0,1,0);
    insert into registrations (event_id, roper_id, created_at) values
      ('${EV(1)}','${RP(1)}','2026-11-01 10:00:00.123456+00'), ('${EV(1)}','${RP(1)}','2026-11-01 13:00:00+00'),
      ('${EV(1)}','${RP(2)}','2026-11-01 11:00:00+00'), ('${EV(1)}','${RP(3)}','2026-11-01 12:00:00+00'), ('${EV(1)}','${RP(5)}','2026-11-01 09:00:00+00'),
      ('${EV(2)}','${RP(4)}','2026-11-01 10:00:00+00'), ('${EV(3)}','${RP(4)}','2026-11-01 10:00:00+00');
  `);
  const asAnon = async (sql) => {
    await db.exec("reset role; set role anon");
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const page = (event, discipline = "lazo", at = null, id = null, limit = 30) =>
    asAnon(`select * from public.event_registrants_page('${event}', '${discipline}', 1, ${at ? `'${at}'` : "null"}, ${id ? `'${id}'` : "null"}, ${limit})`);
  const names = (rows) => rows.map((r) => r.full_name);

  const enrolled = async (slug) => (await asAnon(`select public.event_enrolled('${slug}') as n`))[0].n;
  await check("el conteo es solo de ESE evento (cuenta cada inscripción)", (await enrolled("ins-1")) === 5 && (await enrolled("ins-3")) === 1);
  await check("un borrador o un evento que no existe cuentan cero", (await enrolled("ins-2")) === 0 && (await enrolled("no-existe")) === 0);

  const all = await page(EV(1));
  await check("la lista va de los primeros a los últimos en inscribirse, sin repetir a nadie", JSON.stringify(names(all)) === JSON.stringify(["Ins Uno", "Ins Dos", "Ins Tres"]));
  await check("no sale el perfil fusionado", !names(all).includes("Ins Fusionado"));
  await check("trae nombre, foto y rating de la modalidad del evento", all[0].avatar_path === "a/uno.jpg" && Number(all[0].rating) === 8.5 && all[0].events_count === 6 && all[0].wins === 2 && all[0].is_initial === false);
  await check("quien no tiene rating en esa modalidad parte del inicial", Number(all[1].rating) === 1 && all[1].is_initial === true && all[1].events_count === 0);
  await check("cada modalidad tiene su propio rating", Number((await page(EV(1), "barriles"))[1].rating) === 3);
  await check("la lista de un borrador NO es pública", (await page(EV(2))).length === 0);
  await check("no devuelve celular, correo, pagos ni ids de cuenta", !Object.keys(all[0]).some((k) => /phone|email|user_id|payment|amount/.test(k)));

  const iso = (d) => (d instanceof Date ? d.toISOString() : String(d));
  const p1 = await page(EV(1), "lazo", null, null, 2), last = p1[1];
  const p2 = await page(EV(1), "lazo", iso(last.enrolled_at), last.roper_id, 2);
  const p3 = await page(EV(1), "lazo", iso(p2[p2.length - 1].enrolled_at), p2[p2.length - 1].roper_id, 2);
  await check("el cursor continúa sin repetir ni saltarse a nadie", JSON.stringify(names(p1.concat(p2))) === JSON.stringify(names(all)) && p3.length === 0);
  await check("el límite se acota: nunca menos de 1", (await page(EV(1), "lazo", null, null, 0)).length === 1);

  await as("anon", null, `select * from public.event_registrants_page('${EV(1)}', 'lazo', 1)`, "anónimo SÍ ve la lista de un evento público", "some");
  await as("authenticated", C, "select public.event_enrolled('ins-1')", "un participante SÍ ve el conteo", "some");
  await as("anon", null, "select * from registrations", "la tabla de inscripciones sigue sin ser pública", "deny");
}

console.log("- Resultados: solo de eventos visibles (0029)");
{
  const EV = (n) => `e9000000-0000-0000-0000-00000000000${n}`, RP = `69000000-0000-0000-0000-000000000001`, RS = (n) => `a9000000-0000-0000-0000-00000000000${n}`;
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug) values
      ('${EV(1)}','Vis Publicado','${A}','publicado','vis-1'), ('${EV(2)}','Vis Borrador de A','${A}','borrador','vis-2'),
      ('${EV(3)}','Vis Borrador de B','${B}','borrador','vis-3'), ('${EV(4)}','Vis Finalizado','${A}','finalizado','vis-4');
    insert into ropers (id, full_name) values ('${RP}','Vis Lazador');
    insert into event_results (id, event_id, roper_id, discipline, time_ms, disqualified, place) values
      ('${RS(1)}','${EV(1)}','${RP}','lazo',10000,false,1), ('${RS(2)}','${EV(2)}','${RP}','lazo',11000,false,2),
      ('${RS(3)}','${EV(3)}','${RP}','lazo',12000,false,3), ('${RS(4)}','${EV(4)}','${RP}','lazo',13000,false,4);
    insert into event_results (id, event_id, roper_id, participant_name, discipline, time_ms, disqualified, place) values
      ('${RS(5)}','${EV(2)}',null,'Invitado Vis','lazo',9000,false,1);
  `);
  const ids = "'" + [1, 2, 3, 4, 5].map(RS).join("','") + "'";
  const seen = async (role, uid) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role}`);
    try { return (await db.query(`select id from event_results where id in (${ids}) order by id`)).rows.map((r) => r.id); } finally { await db.exec("reset role"); }
  };
  const same = (got, want) => JSON.stringify(got) === JSON.stringify(want.map(RS));

  await check("anónimo: solo los resultados de eventos publicados o finalizados", same(await seen("anon", null), [1, 4]));
  await check("un participante: lo mismo que un anónimo", same(await seen("authenticated", C), [1, 4]));
  await check("el organizador dueño ve también los de sus borradores (con y sin lazador)", same(await seen("authenticated", A), [1, 2, 4, 5]));
  await check("otro organizador NO ve los borradores de A, pero sí los suyos", same(await seen("authenticated", B), [1, 3, 4]));

  await as("anon", null, `select rounds from event_results where id = '${RS(2)}'`, "anónimo NO lee directo el resultado de un borrador", "deny");
  await as("anon", null, `select id from event_results where event_id = '${EV(3)}'`, "anónimo NO lista los resultados de un borrador por evento", "deny");
  await as("anon", null, `select id from event_results where event_id = '${EV(1)}'`, "anónimo SÍ lista los de un evento publicado", "some");
  await as("anon", null, `select * from public.public_roper_results('${RP}')`, "el historial público sigue funcionando", "some");

  await db.exec(`update events set status = 'publicado' where id = '${EV(2)}'`);
  await check("al publicar el evento sus resultados se ven", same(await seen("anon", null), [1, 2, 4, 5]));
  await db.exec(`update events set status = 'borrador' where id = '${EV(2)}'`);
  await check("al volver a borrador dejan de verse", same(await seen("anon", null), [1, 4]));
}

console.log("- Resultados de un evento (0030)");
{
  const EV = (n) => `ea000000-0000-0000-0000-00000000000${n}`, RP = (n) => `6a000000-0000-0000-0000-00000000000${n}`, RS = (n) => `aa000000-0000-0000-0000-00000000000${n}`;
  const rounds = JSON.stringify([{ round: 1, stage: "preliminary", kind: "regular", status: "completed", time_ms: 12000, penalty_ms: 0 }]);
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug) values
      ('${EV(1)}','Res Evento','${A}','finalizado','res-ev-1'), ('${EV(2)}','Res Borrador','${A}','borrador','res-ev-2');
    insert into ropers (id, full_name, avatar_path) values ('${RP(1)}','Res Ana','a/ana.jpg'), ('${RP(2)}','Res Beto',null), ('${RP(3)}','Res Cata',null), ('${RP(4)}','Res Dani',null);
    insert into ropers (id, full_name, merged_into) values ('${RP(5)}','Res Fusionado','${RP(1)}');
    insert into event_results (id, event_id, roper_id, discipline, time_ms, penalty_ms, disqualified, place, completed_runs, nt_count, dq_count, rounds) values
      ('${RS(1)}','${EV(1)}','${RP(1)}','lazo',12000,0,false,1,1,0,0,'${rounds}'::jsonb),
      ('${RS(2)}','${EV(1)}','${RP(2)}','lazo',13000,1000,false,2,1,0,0,null),
      ('${RS(4)}','${EV(1)}','${RP(3)}','lazo',null,0,true,null,0,0,1,null),
      ('${RS(5)}','${EV(1)}','${RP(4)}','lazo',20000,0,false,null,1,0,0,null),
      ('${RS(6)}','${EV(1)}','${RP(5)}','lazo',25000,0,false,null,1,0,0,null),
      ('${RS(7)}','${EV(1)}','${RP(1)}','barriles',17000,0,false,1,1,0,0,null),
      ('${RS(8)}','${EV(2)}','${RP(1)}','lazo',11000,0,false,1,1,0,0,null);
    insert into event_results (id, event_id, roper_id, participant_name, discipline, time_ms, penalty_ms, disqualified, place) values
      ('${RS(3)}','${EV(1)}',null,'Res Chuy Invitado','lazo',14000,0,false,3);
  `);
  const asAnon = async (sql) => {
    await db.exec("reset role; set role anon");
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const page = (event, discipline = "lazo", after = null, limit = 30) =>
    asAnon(`select * from public.public_event_results('${event}', '${discipline}', ${after ?? "null"}, ${limit})`);
  const names = (rows) => rows.map((r) => r.name);

  const all = await page(EV(1));
  await check("ordena por lugar; luego sin lugar (por tiempo) y al final los descalificados", JSON.stringify(names(all)) === JSON.stringify(["Res Ana", "Res Beto", "Res Chuy Invitado", "Res Dani", "", "Res Cata"]));
  await check("cada fila trae el total de resultados de esa modalidad", all.every((r) => Number(r.total) === 6) && all.map((r) => Number(r.pos)).join() === "1,2,3,4,5,6");
  await check("quien corrió sin lazador en la web sale con su nombre y sin enlace", all[2].roper_id === null && all[2].name === "Res Chuy Invitado" && all[2].place === 3);
  await check("un perfil fusionado no se enlaza ni se nombra", all[4].roper_id === null && all[4].name === "");
  await check("trae lugar, tiempos, castigo, foto y contadores", all[0].place === 1 && all[0].time_ms === 12000 && all[0].avatar_path === "a/ana.jpg" && all[0].completed_runs === 1 && all[1].penalty_ms === 1000);
  await db.exec(`update event_results set packages = 3, shots = 9 where id = '${all[0].id}'`);
  const withPk = await page(EV(1));
  await check("paquetes y tiros (Lazada Sorteada): salen donde se guardaron y en null donde no", withPk[0].packages === 3 && withPk[0].shots === 9 && withPk[1].packages === null && withPk[1].shots === null);
  await check("un descalificado sale marcado, sin lugar ni tiempo", all[5].disqualified === true && all[5].place === null && all[5].time_ms === null && all[5].dq_count === 1);
  await check("avisa si el resultado trae rondas, sin enviarlas", all[0].has_rounds === true && all[1].has_rounds === false && !("rounds" in all[0]));
  await check("cada modalidad va por separado", (await page(EV(1), "barriles")).length === 1 && (await page(EV(1), "otra")).length === 0);
  await check("no devuelve celular, correo ni ids de cuenta", !Object.keys(all[0]).some((k) => /phone|email|user_id/.test(k)));

  const p1 = await page(EV(1), "lazo", null, 2), p2 = await page(EV(1), "lazo", Number(p1[1].pos), 2), p3 = await page(EV(1), "lazo", Number(p2[1].pos), 2), p4 = await page(EV(1), "lazo", Number(p3[1].pos), 2);
  await check("el cursor continúa sin repetir ni saltarse a nadie", JSON.stringify(names(p1.concat(p2, p3))) === JSON.stringify(names(all)) && p4.length === 0);
  await check("el límite se acota: nunca menos de 1", (await page(EV(1), "lazo", null, 0)).length === 1);

  await check("los resultados de un borrador NO salen (anónimo)", (await page(EV(2))).length === 0);
  await as("authenticated", A, `select * from public.public_event_results('${EV(2)}', 'lazo')`, "el organizador dueño SÍ ve los de su borrador", "some");
  await as("authenticated", B, `select * from public.public_event_results('${EV(2)}', 'lazo')`, "otro organizador NO ve los del borrador de A", "deny");
  await as("anon", null, `select * from public.public_event_results('${EV(1)}', 'lazo')`, "anónimo SÍ ve los de un evento finalizado", "some");
  await as("authenticated", C, `select * from public.public_event_results('${EV(1)}', 'lazo')`, "un participante SÍ los ve", "some");
  await as("anon", null, `select rounds from event_results where id = '${RS(1)}' and event_id = '${EV(1)}'`, "las rondas se piden aparte, por evento y resultado", "some");
}

// ---- Cierre de inscripciones (0031, KIN-626) ----
{
  console.log("— Cierre de inscripciones (0031)");
  const EVC = "e0000000-0000-0000-0000-0000000000c1", K1 = "ca000000-0000-0000-0000-0000000000c1", K2 = "ca000000-0000-0000-0000-0000000000c2";
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date, capacity) values ('${EVC}','Con cierre','${A}','publicado','con-cierre','2099-06-15', 50);
    insert into event_categories (id, event_id, name, fee_cents) values ('${K1}','${EVC}','Libre',10000), ('${K2}','${EVC}','Amateur',5000);
    insert into roper_contacts (roper_id, email) values ('22222222-0000-0000-0000-000000000002','p2@x.com');
  `);
  const upd = (set) => `update events set ${set} where id = '${EVC}'`;
  await as("authenticated", A, upd("registration_closes_at = '2099-06-01T18:00:00Z'"), "el organizador pone la fecha límite", "some");
  await as("authenticated", A, upd("registration_closes_at = '2099-06-15T20:00:00Z'"), "puede cerrar el mismo día del evento (zona del evento)", "some");
  await as("authenticated", A, upd("registration_closes_at = '2099-06-16T12:00:00Z'"), "NO puede cerrar después del día del evento", "deny");
  await as("authenticated", A, upd("timezone = 'Marte/Olimpo'"), "una zona horaria inválida se rechaza", "deny");
  await as("authenticated", A, upd("registration_closes_at = '2099-06-01T18:00:00Z'"), "se vuelve a poner la fecha de junio", "some");
  await as("authenticated", B, upd("registration_closed = true"), "otro organizador NO cierra las inscripciones de A", "deny");
  await as("authenticated", C, upd("registration_closed = true"), "un participante NO cierra inscripciones", "deny");
  await as("authenticated", C, `select public.register_for_event('${EVC}','${K1}')`, "antes de la fecha límite SÍ se inscribe", "some");

  await as("authenticated", A, upd("registration_closes_at = '2000-01-01T00:00:00Z'"), "el organizador mueve la fecha límite al pasado", "some");
  await as("authenticated", P2, `select public.register_for_event('${EVC}','${K1}')`, "pasada la fecha límite NO se puede inscribir (llamando directo)", "deny");
  await as("authenticated", A, `select public.organizer_enroll('${EVC}','P2@X.com','${K1}')`, "el organizador SÍ inscribe a alguien después del cierre", "some");
  await as("authenticated", A, `select public.organizer_enroll('${EVC}','p2@x.com','${K1}')`, "no la inscribe dos veces en la misma categoría", "deny");
  await as("authenticated", A, `select public.organizer_enroll('${EVC}','nadie@x.com','${K1}')`, "un correo sin participante se rechaza", "deny");
  await as("authenticated", A, `select public.organizer_enroll('${EVC}','p2@x.com','ca000000-0000-0000-0000-000000000001')`, "una categoría de otro evento se rechaza", "deny");
  await as("authenticated", B, `select public.organizer_enroll('${EVC}','p2@x.com','${K2}')`, "otro organizador NO inscribe en un evento ajeno", "deny");
  await as("authenticated", C, `select public.organizer_enroll('${EVC}','p2@x.com','${K2}')`, "un participante NO usa organizer_enroll", "deny");
  await as("anon", null, `select public.organizer_enroll('${EVC}','p2@x.com','${K2}')`, "anónimo NO usa organizer_enroll", "deny");

  await as("authenticated", A, upd("registration_closes_at = null"), "sin fecha límite", "some");
  await as("authenticated", A, upd("registration_closed = true"), "el organizador cierra antes de tiempo", "some");
  await as("authenticated", C, `select public.register_for_event('${EVC}','${K2}')`, "cerrado a mano NO se puede inscribir", "deny");
  await as("authenticated", A, upd("registration_closed = false"), "el organizador reabre", "some");
  await as("authenticated", C, `select public.register_for_event('${EVC}','${K2}')`, "reabierto SÍ se puede inscribir", "some");
}

// ---- Rol del lazador (0032, KIN-622) ----
{
  console.log("— Rol del lazador (0032)");
  const ANA = "11111111-0000-0000-0000-000000000001"; // perfil de C, inscrita en EV
  const setRole = (id, set) => `update ropers set ${set} where id = '${id}'`;
  await as("anon", null, "select primary_role, favorite_role from ropers", "el rol es público (se ve en el perfil)", "some");
  await as("authenticated", C, setRole(ANA, "primary_role = 'header'"), "el dueño elige su rol (cabecero)", "some");
  await as("authenticated", C, setRole(ANA, "primary_role = 'both'"), "'ambos' SIN favorito se rechaza", "deny");
  await as("authenticated", C, setRole(ANA, "primary_role = 'both', favorite_role = 'both'"), "el favorito solo puede ser cabecero o pialador", "deny");
  await as("authenticated", C, setRole(ANA, "primary_role = 'header', favorite_role = 'heeler'"), "un solo rol NO lleva favorito", "deny");
  await as("authenticated", C, setRole(ANA, "primary_role = 'astronauta'"), "un rol inventado se rechaza", "deny");
  await as("authenticated", C, setRole(ANA, "primary_role = 'both', favorite_role = 'heeler'"), "'ambos' con favorito (pialador) se guarda", "some");
  await as("authenticated", P2, setRole(ANA, "primary_role = 'heeler', favorite_role = null"), "otra persona NO cambia el rol de un perfil ajeno", "deny");
  await as("anon", null, setRole(ANA, "primary_role = 'heeler', favorite_role = null"), "anónimo NO cambia roles", "deny");

  // Perfil nuevo con rol al crear la cuenta
  const N1 = "aaaa1111-0000-0000-0000-0000000000a1", N2 = "aaaa1111-0000-0000-0000-0000000000a2", N3 = "aaaa1111-0000-0000-0000-0000000000a3";
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${N1}','n1@x.com',now()), ('${N2}','n2@x.com',now()), ('${N3}','roles@x.com',now());
    insert into profiles (user_id, role, display_name) values ('${N1}','participante','N1'), ('${N2}','participante','N2'), ('${N3}','participante','N3');
  `);
  await as("authenticated", N1, "select public.claim_my_roper('Nuevo Con Rol', 'both', 'header')", "crear el perfil con rol (ambos, favorito cabecero)", "some");
  await as("anon", null, "select id from ropers where full_name = 'Nuevo Con Rol' and primary_role = 'both' and favorite_role = 'header'", "quedó guardado en el perfil", "some");
  await as("authenticated", N2, "select public.claim_my_roper('Mal Rol', 'both', null)", "'ambos' sin favorito se rechaza al crear", "deny");
  await as("authenticated", N2, "select public.claim_my_roper('Mal Rol', 'header', 'heeler')", "un rol con favorito se rechaza al crear", "deny");
  await as("authenticated", N2, "select public.claim_my_roper('Mal Rol', 'otro', null)", "un rol inventado se rechaza al crear", "deny");
  await as("authenticated", N2, "select public.claim_my_roper('Sin Rol')", "sin rol sigue funcionando (perfiles anteriores)", "some");
  await as("anon", null, "select id from ropers where full_name = 'Sin Rol' and primary_role is null and favorite_role is null", "un perfil sin rol queda 'sin definir'", "some");
  await as("authenticated", N1, "select public.claim_my_roper('Otro Nombre', 'heeler', null)", "pedirlo otra vez NO cambia el rol ya guardado", "some");
  await as("anon", null, "select id from ropers where full_name = 'Nuevo Con Rol' and primary_role = 'both'", "el rol sigue siendo el primero", "some");

  // Un organizador ya había registrado a la persona por correo: al reclamar ese perfil se guarda el rol elegido
  await as("authenticated", A, "select public.create_participant('Creado Por Org', 'roles@x.com')", "un organizador registra a alguien por correo", "some");
  await as("authenticated", N3, "select public.claim_my_roper('Da igual', 'heeler', null)", "al reclamar ese perfil se guarda su rol", "some");
  await as("anon", null, "select id from ropers where full_name = 'Creado Por Org' and primary_role = 'heeler'", "el perfil reclamado tiene el rol elegido", "some");

  // API de la app: los participantes del evento traen su rol y su favorito
  await as("service_role", null, `select role, favorite_role from public.app_event_participants('${EV}', null, now() + interval '1 minute', null, null, 50) where role = 'both' and favorite_role = 'heeler'`, "la app recibe el rol y el favorito", "some");
  await as("authenticated", C, `select * from public.app_event_participants('${EV}', null, now(), null, null, 50)`, "un participante NO usa la función de la app", "deny");
}

// ---- Sacar a un inscrito del evento (0033, KIN-621) ----
{
  console.log("— Sacar a un inscrito (0033)");
  const EVR = "e0000000-0000-0000-0000-0000000000d1", EVF = "e0000000-0000-0000-0000-0000000000d2", KR = "ca000000-0000-0000-0000-0000000000d1";
  const ANA = "11111111-0000-0000-0000-000000000001", PD = "22222222-0000-0000-0000-000000000002"; // perfiles de C y de P2
  const N1 = "aaaa1111-0000-0000-0000-0000000000a1"; // tiene perfil "Nuevo Con Rol" (sección anterior)
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date, capacity) values ('${EVR}','Para sacar','${A}','publicado','para-sacar','2099-08-01', 2), ('${EVF}','Ya terminó','${A}','finalizado','ya-termino','2020-01-01', 10);
    insert into event_categories (id, event_id, name, fee_cents) values ('${KR}','${EVR}','Libre',10000);
  `);
  const regOf = (roper, ev = EVR) => `(select id from registrations where event_id = '${ev}' and roper_id = '${roper}' limit 1)`;
  const rm = (roper, reason = "No cumple los requisitos", ev = EVR) => `select public.remove_registration(${regOf(roper, ev)}, '${reason}')`;
  await as("authenticated", C, `select public.register_for_event('${EVR}','${KR}', 'header')`, "C se inscribe", "some");
  await as("authenticated", P2, `select public.register_for_event('${EVR}','${KR}')`, "P2 se inscribe", "some");
  await as("authenticated", A, `select public.set_registration_payment(${regOf(PD)}, 'efectivo')`, "el organizador marca a P2 como pagado en efectivo", "some");
  await as("authenticated", N1, `select public.register_for_event('${EVR}','${KR}')`, "con el cupo lleno (2/2) un tercero NO se inscribe", "deny");

  await as("authenticated", C, rm(ANA), "un participante NO se saca a sí mismo con esta acción", "deny");
  await as("authenticated", P2, rm(ANA), "un participante NO saca a otro", "deny");
  await as("anon", null, rm(ANA), "anónimo NO saca a nadie", "deny");
  await as("authenticated", B, rm(ANA), "otro organizador NO saca inscritos de un evento ajeno", "deny");
  await as("authenticated", A, rm(ANA, ""), "sin motivo NO se puede", "deny");
  await as("authenticated", A, rm(ANA, "  ab "), "un motivo de menos de 3 caracteres NO se puede", "deny");
  await as("authenticated", A, `select public.remove_registration('${"9e000000-0000-0000-0000-0000000000ff"}', 'No existe')`, "una inscripción inexistente se rechaza", "deny");
  await as("authenticated", A, rm(ANA, "No se recibió el pago"), "el organizador SÍ saca a C (pendiente) con motivo", "some");
  await as("authenticated", A, `select id from registrations where event_id = '${EVR}' and roper_id = '${ANA}'`, "C ya no está inscrita", "deny");
  await as("authenticated", A, `select count(*) from registrations where event_id = '${EVR}' having count(*) = 1`, "el conteo del evento bajó a 1", "some");
  await as("authenticated", N1, `select public.register_for_event('${EVR}','${KR}', 'header')`, "el cupo liberado lo toma otra persona", "some");

  // El registro
  await as("authenticated", A, `select reason, payment_status, refund_pending from registration_removals where event_id = '${EVR}' and roper_id = '${ANA}' and removed_by = '${A}' and reason = 'No se recibió el pago' and payment_status = 'pendiente' and not refund_pending`, "queda el registro: quién, motivo y estado de pago", "some");
  await as("authenticated", C, `select reason from registration_removals where roper_id = '${ANA}'`, "el sacado ve el motivo", "some");
  await as("authenticated", P2, `select id from registration_removals where roper_id = '${ANA}'`, "otro participante NO ve el registro", "deny");
  await as("authenticated", B, `select id from registration_removals`, "otro organizador NO ve los registros del evento ajeno", "deny");
  await as("anon", null, "select id from registration_removals", "anónimo NO ve registros", "deny");
  await as("authenticated", D, "select id from registration_removals", "un admin SÍ los ve", "some");
  await as("authenticated", A, `update registration_removals set reason = 'cambiado' where event_id = '${EVR}'`, "nadie edita el registro escribiendo la tabla", "deny");
  await as("authenticated", A, `delete from registration_removals where event_id = '${EVR}'`, "nadie borra el registro escribiendo la tabla", "deny");
  await as("authenticated", A, `insert into registration_removals (event_id, roper_id, reason, payment_status) values ('${EVR}','${ANA}','falso','pendiente')`, "nadie crea registros escribiendo la tabla", "deny");

  // Avisos dentro de la web (KIN-657): al sacar a alguien se le crea un aviso que solo él lee y marca como leído
  await as("authenticated", C, `select reason from notifications where kind = 'removed' and event_name = 'Para sacar' and reason = 'No se recibió el pago'`, "el sacado recibe un aviso con el motivo", "some");
  await as("authenticated", P2, `select id from notifications`, "otro participante NO ve avisos ajenos", "deny");
  await as("authenticated", A, `select id from notifications`, "ni el organizador que lo sacó lee el aviso", "deny");
  await as("anon", null, `select id from notifications`, "anónimo NO ve avisos", "deny");
  await as("authenticated", P2, `update notifications set read_at = now()`, "otro participante NO marca avisos ajenos como leídos", "deny");
  await as("authenticated", C, `update notifications set reason = 'cambiado'`, "el destinatario NO edita el contenido del aviso", "deny");
  await as("authenticated", C, `insert into notifications (user_id, kind) values ('${C}', 'removed')`, "nadie crea avisos escribiendo la tabla", "deny");
  await as("authenticated", C, `update notifications set read_at = now() where read_at is null`, "el destinatario SÍ lo marca como leído", "some");

  // Volver a inscribirse
  await as("authenticated", C, `select public.register_for_event('${EVR}','${KR}', 'header')`, "quien fue sacado NO se inscribe solo otra vez", "deny");
  await as("authenticated", C, `select public.set_removal_reenroll((select id from registration_removals where roper_id = '${ANA}' limit 1), true)`, "el sacado NO se da permiso a sí mismo", "deny");
  await as("authenticated", B, `select public.set_removal_reenroll((select id from registration_removals where roper_id = '${ANA}' limit 1), true)`, "otro organizador NO da permiso", "deny");
  await as("authenticated", A, `select public.set_removal_reenroll((select id from registration_removals where roper_id = '${ANA}' limit 1), true)`, "el organizador permite que vuelva", "some");
  await as("authenticated", A, `update events set capacity = 5 where id = '${EVR}'`, "se amplía el cupo", "some");
  await as("authenticated", C, `select public.register_for_event('${EVR}','${KR}', 'header')`, "con permiso, C se inscribe otra vez", "some");
  await as("authenticated", A, `select public.set_removal_reenroll((select id from registration_removals where roper_id = '${ANA}' limit 1), false)`, "el organizador vuelve a bloquear", "some");
  await as("authenticated", P2, `select 1 from registration_removals where roper_id = '${PD}'`, "(P2 aún no ha sido sacado)", "deny");

  // Pagos y reembolso
  await as("authenticated", A, rm(PD, "Datos incorrectos"), "el organizador saca a P2, que ya había pagado", "some");
  await as("authenticated", A, `select 1 from registration_removals where roper_id = '${PD}' and payment_status = 'pagado' and payment_method = 'efectivo' and amount_cents = 10000 and refund_pending`, "queda 'reembolso pendiente' con lo que había pagado", "some");
  await as("authenticated", P2, `select 1 from registration_removals where roper_id = '${PD}' and refund_pending`, "P2 ve que su reembolso está pendiente", "some");
  await as("authenticated", P2, `select public.set_removal_refunded((select id from registration_removals where roper_id = '${PD}' limit 1), true)`, "P2 NO marca su propio reembolso", "deny");
  await as("authenticated", B, `select public.set_removal_refunded((select id from registration_removals where roper_id = '${PD}' limit 1), true)`, "otro organizador NO marca reembolsos ajenos", "deny");
  await as("authenticated", A, `select public.set_removal_refunded((select id from registration_removals where roper_id = '${PD}' limit 1), true)`, "el organizador marca el reembolso como hecho", "some");
  await as("authenticated", A, `select 1 from registration_removals where roper_id = '${PD}' and not refund_pending and refund_done_at is not null`, "ya no está pendiente y queda la fecha", "some");
  await as("authenticated", A, `select public.set_removal_refunded((select id from registration_removals where roper_id = '${PD}' limit 1), false)`, "puede deshacerlo", "some");
  await as("authenticated", A, `select public.set_removal_refunded((select id from registration_removals where roper_id = '${ANA}' limit 1), true)`, "un sacado sin pago no tiene reembolso que marcar", "deny");

  // Límites: resultados y evento finalizado
  const N1ROPER = (await db.query(`select id from ropers where user_id = '${N1}'`)).rows[0].id;
  await db.exec(`insert into event_results (id, event_id, roper_id, discipline, time_ms) values (gen_random_uuid(), '${EVR}', '${N1ROPER}', 'lazo', 9000)`);
  await as("authenticated", A, `select public.remove_registration(${regOf(N1ROPER)}, 'Con resultados')`, "quien ya tiene resultados en el evento NO se puede sacar", "deny");
  await db.exec(`insert into registrations (id, event_id, roper_id, category_id) values ('9e000000-0000-0000-0000-0000000000f1','${EVF}','${PD}', null)`);
  await as("authenticated", A, `select public.remove_registration('9e000000-0000-0000-0000-0000000000f1', 'Ya terminó')`, "en un evento finalizado NO se saca a nadie", "deny");

  // Admin
  const ANAREG = (await db.query(`select id from registrations where event_id = '${EVR}' and roper_id = '${ANA}'`)).rows[0].id;
  await as("authenticated", D, `select public.remove_registration('${ANAREG}', 'Decisión de la plataforma')`, "un admin SÍ puede sacar a alguien", "some");
  await as("authenticated", D, `select 1 from registration_removals where roper_id = '${ANA}' and removed_by = '${D}'`, "queda registrado que lo hizo el admin", "some");

  // API de la app: el sacado deja de venir en los participantes del evento
  await as("service_role", null, `select 1 from public.app_event_participants('${EVR}', null, now() + interval '1 minute', null, null, 50) where global_id in ('${ANA}', '${PD}')`, "los sacados NO vienen en la API de participantes de la app", "deny");
  await as("service_role", null, `select 1 from public.app_event_participants('${EVR}', null, now() + interval '1 minute', null, null, 50)`, "los demás inscritos siguen viniendo", "some");
}

// ---- Rol por inscripción (0034, KIN-623) ----
{
  console.log("— Rol por inscripción (0034)");
  const EVL = "e0000000-0000-0000-0000-0000000000e1", KL = "ca000000-0000-0000-0000-0000000000e1", KL2 = "ca000000-0000-0000-0000-0000000000e2";
  const mk = (n, role, fav) => ({ uid: `e1e1e1e1-0000-0000-0000-00000000000${n}`, roper: `e2e2e2e2-0000-0000-0000-00000000000${n}`, role, fav, email: `rol${n}@x.com` });
  const U1 = mk(1, "both", "header"), U2 = mk(2, "header", null), U3 = mk(3, null, null), U4 = mk(4, "both", "heeler"), U5 = mk(5, "both", "heeler"), U6 = mk(6, "both", "heeler"), U7 = mk(7, "both", "header");
  for (const u of [U1, U2, U3, U4, U5, U6, U7]) {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values ('${u.uid}','${u.email}',now());
      insert into profiles (user_id, role, display_name) values ('${u.uid}','participante','${u.email}');
      insert into ropers (id, full_name, user_id, primary_role, favorite_role) values ('${u.roper}','Rol ${u.email}','${u.uid}', ${u.role ? `'${u.role}'` : "null"}, ${u.fav ? `'${u.fav}'` : "null"});
      insert into roper_contacts (roper_id, email) values ('${u.roper}','${u.email}');
    `);
  }
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date, capacity) values ('${EVL}','Con roles','${A}','publicado','con-roles','2099-09-01', 5);
    insert into event_categories (id, event_id, name, fee_cents) values ('${KL}','${EVL}','Libre',10000), ('${KL2}','${EVL}','Amateur',7000);
  `);
  const reg = (u, k, role) => `select public.register_for_event('${EVL}','${k}', ${role === undefined ? "null" : `'${role}'`})`;
  const count = async (where = "true") => Number((await db.query(`select count(*) n from registrations where event_id = '${EVL}' and ${where}`)).rows[0].n);
  const check = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };

  // Perfil "Ambos": debe elegir
  await as("authenticated", U1.uid, `select public.register_for_event('${EVL}','${KL}')`, "'Ambos' sin elegir rol se rechaza (versión de 2 argumentos)", "deny");
  await as("authenticated", U1.uid, reg(U1, KL), "'Ambos' sin elegir rol se rechaza (rol vacío)", "deny");
  await as("authenticated", U1.uid, reg(U1, KL, "astronauta"), "un rol inventado se rechaza", "deny");
  await as("authenticated", U1.uid, reg(U1, KL, "header"), "'Ambos' se inscribe como cabecero", "some");
  check("la inscripción guarda el rol elegido y el costo de la categoría", await count(`roper_id = '${U1.roper}' and role = 'header' and amount_cents = 10000`) === 1);
  await as("authenticated", U1.uid, reg(U1, KL, "header"), "el mismo rol en la misma categoría NO se repite", "deny");
  await as("authenticated", U1.uid, reg(U1, KL, "both"), "'los dos' cuando ya está como cabecero se rechaza (ya está)", "deny");
  await as("authenticated", U1.uid, reg(U1, KL, "heeler"), "SÍ puede sumar el otro rol en la misma categoría", "some");
  check("el perfil NO cambió al inscribirse", (await db.query(`select 1 from ropers where id = '${U1.roper}' and primary_role = 'both' and favorite_role = 'header'`)).rows.length === 1);

  // Perfil con un solo rol
  await as("authenticated", U2.uid, `select public.register_for_event('${EVL}','${KL}')`, "perfil cabecero se inscribe sin elegir (rol del perfil)", "some");
  check("queda con el rol de su perfil", await count(`roper_id = '${U2.roper}' and role = 'header'`) === 1);
  await as("authenticated", U2.uid, reg(U2, KL2, "heeler"), "perfil cabecero NO se inscribe como pialador", "deny");
  await as("authenticated", U2.uid, reg(U2, KL2, "both"), "perfil cabecero NO se inscribe como 'los dos'", "deny");
  await as("authenticated", U2.uid, reg(U2, KL2, "header"), "perfil cabecero con su mismo rol, sí", "some");

  // Perfil sin rol
  await as("authenticated", U3.uid, `select public.register_for_event('${EVL}','${KL}')`, "perfil sin rol se inscribe (no se le bloquea)", "some");
  check("queda con rol null", await count(`roper_id = '${U3.roper}' and role is null`) === 1);
  await as("authenticated", U3.uid, reg(U3, KL2, "header"), "perfil sin rol NO manda un rol inventado por su cuenta", "deny");

  // "Los dos" = dos inscripciones, cupo y costo; todo o nada
  check("hasta aquí hay 5 inscripciones (cupo 5, lleno)", await count() === 5);
  await as("authenticated", U4.uid, reg(U4, KL, "both"), "con el cupo lleno 'los dos' NO se inscribe", "deny");
  await as("authenticated", A, `update events set capacity = 6 where id = '${EVL}'`, "el organizador deja 1 lugar libre", "some");
  await as("authenticated", U4.uid, reg(U4, KL, "both"), "con 1 lugar libre 'los dos' (2 lugares) NO se inscribe", "deny");
  check("todo o nada: no quedó ninguna de las dos", await count(`roper_id = '${U4.roper}'`) === 0);
  await as("authenticated", A, `update events set capacity = 9 where id = '${EVL}'`, "el organizador amplía el cupo", "some");
  await as("authenticated", U4.uid, reg(U4, KL, "both"), "con lugar, 'los dos' SÍ se inscribe", "some");
  check("'los dos' creó dos inscripciones (cabecero y pialador), cada una con su costo", await count(`roper_id = '${U4.roper}' and role in ('header','heeler') and amount_cents = 10000`) === 2);
  check("ocupan 2 lugares del cupo", await count() === 7);

  // Cambiar el rol de una inscripción
  const regId = async (u, role, k = KL) => (await db.query(`select id from registrations where event_id = '${EVL}' and roper_id = '${u.roper}' and category_id = '${k}' and role ${role ? `= '${role}'` : "is null"} limit 1`)).rows[0]?.id;
  const U1heeler = await regId(U1, "heeler"), U4header = await regId(U4, "header");
  await as("authenticated", U1.uid, `select public.change_registration_role('${U1heeler}', 'header')`, "no puede cambiar a un rol que ya tiene en esa categoría", "deny");
  await as("authenticated", U4.uid, `select public.change_registration_role('${U4header}', 'heeler')`, "tampoco con 'los dos'", "deny");
  await as("authenticated", U5.uid, reg(U5, KL2, "header"), "U5 ('Ambos') se inscribe como cabecero", "some");
  const U5reg = await regId(U5, "header", KL2);
  await as("authenticated", U2.uid, `select public.change_registration_role('${U5reg}', 'heeler')`, "otra persona NO cambia el rol ajeno", "deny");
  await as("anon", null, `select public.change_registration_role('${U5reg}', 'heeler')`, "anónimo NO cambia roles", "deny");
  await as("authenticated", U5.uid, `select public.change_registration_role('${U5reg}', 'both')`, "no se puede cambiar a 'los dos' (son dos inscripciones)", "deny");
  await as("authenticated", U5.uid, `select public.change_registration_role('${U5reg}', 'heeler')`, "con inscripciones abiertas SÍ cambia su rol", "some");
  check("el rol de la inscripción cambió y el perfil no", await count(`id = '${U5reg}' and role = 'heeler'`) === 1 &&
    (await db.query(`select 1 from ropers where id = '${U5.roper}' and primary_role = 'both'`)).rows.length === 1);
  const U2reg = await regId(U2, "header");
  await as("authenticated", U2.uid, `select public.change_registration_role('${U2reg}', 'heeler')`, "un perfil de un solo rol NO cambia el rol de su inscripción", "deny");
  await as("authenticated", A, `update events set registration_closed = true where id = '${EVL}'`, "el organizador cierra las inscripciones", "some");
  await as("authenticated", U5.uid, `select public.change_registration_role('${U5reg}', 'header')`, "con inscripciones cerradas NO se cambia el rol", "deny");
  await as("authenticated", A, `update events set registration_closed = false where id = '${EVL}'`, "el organizador reabre", "some");

  // El organizador inscribe con rol
  await as("authenticated", A, `update events set capacity = 20 where id = '${EVL}'`, "el organizador amplía el cupo otra vez", "some");
  await as("authenticated", A, `select public.organizer_enroll('${EVL}','${U6.email}','${KL}', null)`, "el organizador inscribe a 'Ambos' sin rol: usa su favorito", "some");
  check("quedó con el rol favorito (pialador)", await count(`roper_id = '${U6.roper}' and role = 'heeler'`) === 1);
  await as("authenticated", A, `select public.organizer_enroll('${EVL}','${U7.email}','${KL}', 'both')`, "el organizador inscribe a alguien como 'los dos'", "some");
  check("quedaron las dos inscripciones", await count(`roper_id = '${U7.roper}'`) === 2);
  await as("authenticated", A, `select public.organizer_enroll('${EVL}','${U2.email}','${KL2}', 'heeler')`, "el organizador NO inscribe a un perfil cabecero como pialador", "deny");
  await as("authenticated", A, `select public.organizer_enroll('${EVL}','${U6.email}','${KL}')`, "la versión de 3 argumentos sigue funcionando (ya inscrito: se rechaza)", "deny");
  await as("authenticated", C, `select public.organizer_enroll('${EVL}','${U3.email}','${KL2}', null)`, "un participante NO usa organizer_enroll", "deny");

  // API de la app
  await as("service_role", null, `select 1 from public.app_organizer_events('${A}', null, now() + interval '1 minute', null, null, 50) e, jsonb_array_elements(e.registrations) r where e.id = '${EVL}' and r->>'role' = 'heeler'`, "la API de eventos de la app trae el rol de cada inscripción", "some");
  await as("service_role", null, `select 1 from public.app_organizer_events('${A}', null, now() + interval '1 minute', null, null, 50) e, jsonb_array_elements(e.registrations) r where e.id = '${EVL}' and r->>'role' is null`, "y null en las de perfiles sin rol", "some");
}

// ---- Series de eventos (0035, KIN-625) ----
{
  console.log("— Series de eventos (0035)");
  const S1 = "5e000000-0000-0000-0000-000000000001";
  // B ya tiene licencia en este punto de las pruebas: sirve como "otro organizador"; NL es un organizador sin licencia ni aprobación.
  const NL = "5e5e5e5e-0000-0000-0000-0000000000a1";
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${NL}','sinlicencia@x.com',now());
    insert into profiles (user_id, role, display_name, organizer_verified) values ('${NL}','organizador','Sin licencia',false);
  `);
  const check = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const ev = (n, date, opens) => ({ id: `5e5e5e5e-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`, slug: `serie-fecha-${n}`, name: `Fecha ${n}`, date, opens_at: opens ?? null });
  const add = (events, publish = true, series = S1) => `select public.add_series_events('${series}', '${JSON.stringify(events)}'::jsonb, ${publish})`;

  // Crear la serie y su plantilla
  const ins = (org, extra = "") => `insert into event_series (id, slug, organizer_id, organizer_name, name, start_date, end_date ${extra ? ", " + extra.split("|")[0] : ""}) values ('${S1}', 'serie-2099', '${org}', 'Org', 'Serie 2099', '2099-01-01', '2099-12-31' ${extra ? ", " + extra.split("|")[1] : ""})`;
  await as("authenticated", NL, ins(NL), "un organizador SIN licencia NO crea series", "deny");
  await as("authenticated", C, ins(C), "un participante NO crea series", "deny");
  await as("authenticated", A, ins(B), "NO crea una serie a nombre de otro organizador", "deny");
  await as("anon", null, ins(A), "anónimo NO crea series", "deny");
  await as("authenticated", A, `insert into event_series (slug, organizer_id, name, start_date, end_date) values ('mala-serie', '${A}', 'Mala', '2099-05-01', '2099-04-01')`, "el fin no puede ser antes del inicio", "deny");
  await as("authenticated", A, ins(A), "el organizador verificado SÍ crea su serie", "some");
  await as("authenticated", A, `insert into event_series_template (series_id, city, venue, capacity, disciplines, categories, payment_info) values ('${S1}', 'Monterrey', 'Lienzo', 80, array['lazo'], '[{"name":"Libre","fee_cents":80000},{"name":"Amateur","fee_cents":50000}]'::jsonb, 'Transferencia a la cuenta 123')`, "SÍ guarda la plantilla de la serie", "some");
  await as("authenticated", B, `insert into event_series_template (series_id, city, venue, capacity, disciplines, categories) values ('${S1}', 'x', 'x', 1, array['lazo'], '[]'::jsonb)`, "otro organizador NO escribe la plantilla ajena", "deny");
  await as("authenticated", NL, `select public.add_series_events('${S1}', '[]'::jsonb, true)`, "(sin licencia) tampoco usa las funciones de la serie", "deny");

  // Visibilidad: sin eventos visibles la serie solo la ve su dueño; la plantilla (con instrucciones de pago) solo el dueño
  await as("anon", null, `select id from event_series where id = '${S1}'`, "sin eventos visibles el público NO ve la serie", "deny");
  await as("authenticated", C, `select id from event_series where id = '${S1}'`, "un participante tampoco", "deny");
  await as("authenticated", A, `select id from event_series where id = '${S1}'`, "el dueño SÍ la ve", "some");
  await as("authenticated", A, `select series_id from event_series_template where series_id = '${S1}'`, "el dueño SÍ ve su plantilla", "some");

  // Crear eventos de golpe
  await as("authenticated", NL, add([ev(1, "2099-03-01")]), "un organizador sin licencia NO crea eventos de la serie", "deny");
  await as("authenticated", B, add([ev(1, "2099-03-01")]), "otro organizador NO crea eventos en la serie ajena", "deny");
  await as("authenticated", C, add([ev(1, "2099-03-01")]), "un participante NO crea eventos de la serie", "deny");
  await as("anon", null, add([ev(1, "2099-03-01")]), "anónimo NO crea eventos de la serie", "deny");
  const other = "5e000000-0000-0000-0000-0000000000ff";
  await db.exec(`insert into event_series (id, slug, organizer_id, name, start_date, end_date) values ('${other}', 'serie-de-d', '${D}', 'De D', '2099-01-01', '2099-12-31')`);
  await as("authenticated", A, add([ev(1, "2099-03-01")], true, other), "NO agrega eventos a la serie de otro organizador", "deny");
  await as("authenticated", A, add([ev(1, "2099-03-01"), ev(2, "2100-01-15")]), "una fecha fuera del rango de la serie se rechaza", "deny");
  check("todo o nada: no se creó ni el evento válido", await num(`select count(*) n from events where series_id = '${S1}'`) === 0);
  await as("authenticated", A, add([]), "una lista vacía se rechaza", "deny");
  await as("authenticated", A, add([{ ...ev(1, "2099-03-01"), slug: "Mal Slug" }]), "un enlace inválido se rechaza", "deny");
  await as("authenticated", A, add([{ ...ev(1, "2099-03-01"), opens_at: "2099-03-02T12:00:00Z" }]), "la apertura no puede ser después del día del evento", "deny");
  await as("authenticated", A, add([ev(1, "2099-03-01"), ev(2, "2099-04-01", "2099-03-15T15:00:00Z"), ev(3, "2099-05-01")]), "SÍ crea 3 eventos de golpe (uno con apertura programada)", "some");
  check("los 3 eventos quedaron en la serie y publicados", await num(`select count(*) n from events where series_id = '${S1}' and status = 'publicado' and organizer_id = '${A}'`) === 3);
  check("cada evento copió la plantilla (ciudad, sede, cupo y modalidades)", await num(`select count(*) n from events where series_id = '${S1}' and city = 'Monterrey' and venue = 'Lienzo' and capacity = 80 and disciplines = array['lazo']`) === 3);
  check("cada evento copió las categorías con su costo", await num(`select count(*) n from event_categories c join events e on e.id = c.event_id where e.series_id = '${S1}' and ((c.name = 'Libre' and c.fee_cents = 80000) or (c.name = 'Amateur' and c.fee_cents = 50000))`) === 6);
  check("y las instrucciones de pago", await num(`select count(*) n from event_payment_info i join events e on e.id = i.event_id where e.series_id = '${S1}' and i.instructions = 'Transferencia a la cuenta 123'`) === 3);
  check("la apertura programada se guardó solo en el evento que la pidió", await num(`select count(*) n from events where series_id = '${S1}' and registration_opens_at is not null`) === 1);
  await as("authenticated", A, add([ev(1, "2099-06-01")]), "repetir un id de evento se rechaza", "deny");
  await as("authenticated", A, add([{ ...ev(4, "2099-06-01"), slug: "serie-fecha-1" }]), "repetir un enlace se rechaza", "deny");

  // Lo público
  await as("anon", null, `select id from event_series where id = '${S1}'`, "con eventos publicados el público SÍ ve la serie", "some");
  await as("anon", null, `select series_id from event_series_template where series_id = '${S1}'`, "pero NO ve su plantilla (instrucciones de pago)", "deny");
  await as("authenticated", C, `select series_id from event_series_template where series_id = '${S1}'`, "un participante tampoco ve la plantilla", "deny");
  await as("authenticated", B, `select series_id from event_series_template where series_id = '${S1}'`, "otro organizador tampoco", "deny");
  await as("anon", null, `select id from event_series where id = '${other}'`, "una serie sin eventos visibles sigue oculta", "deny");

  // Apertura programada de inscripciones
  const E2 = ev(2, "2099-04-01").id, E1 = ev(1, "2099-03-01").id;
  const kat = async (e) => (await db.query(`select id from event_categories where event_id = '${e}' limit 1`)).rows[0].id;
  await as("authenticated", C, `select public.register_for_event('${E2}', '${await kat(E2)}', 'header')`, "antes de la apertura programada NO se puede inscribir (llamando directo)", "deny");
  await as("authenticated", C, `select public.register_for_event('${E1}', '${await kat(E1)}', 'header')`, "un evento sin apertura programada SÍ acepta inscripciones", "some");
  await as("authenticated", A, `select public.organizer_enroll('${E2}', 'c@x.com', '${await kat(E2)}')`, "(sin contacto de correo) el organizador NO inscribe a quien no existe", "deny");
  await as("authenticated", A, `update events set registration_opens_at = '2099-03-15T15:00:00Z', registration_closes_at = '2099-03-15T15:00:00Z' where id = '${E2}'`, "la apertura debe ser antes del cierre", "deny");
  await as("authenticated", A, `update events set registration_opens_at = '2099-04-02T12:00:00Z' where id = '${E2}'`, "la apertura no puede caer después del día del evento", "deny");
  await as("authenticated", B, `update events set registration_opens_at = null where id = '${E2}'`, "otro organizador NO cambia la apertura ajena", "deny");
  await as("authenticated", A, `update events set registration_opens_at = '2000-01-01T00:00:00Z' where id = '${E2}'`, "el organizador pone la apertura en el pasado (ya abierta)", "some");
  await as("authenticated", C, `select public.register_for_event('${E2}', '${await kat(E2)}', 'header')`, "llegada la fecha de apertura SÍ se inscribe, sin que nadie la abra", "some");
  await as("authenticated", A, `update events set registration_opens_at = null where id = '${E2}'`, "quitar la apertura programada (desde que se publica)", "some");

  // KIN-656: un evento con fecha pasada no acepta inscripciones aunque nadie lo haya cerrado (llamando directo)
  const EVP = "e0000000-0000-0000-0000-0000000000f6", KP = "ca000000-0000-0000-0000-0000000000f6";
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date, capacity) values ('${EVP}','Fecha pasada','${A}','publicado','fecha-pasada','2020-01-01', 50);
    insert into event_categories (id, event_id, name, fee_cents) values ('${KP}','${EVP}','Libre',10000);
  `);
  await as("authenticated", C, `select public.register_for_event('${EVP}', '${KP}', 'header')`, "un evento con fecha pasada NO acepta inscripciones (llamando directo)", "deny");

  // Rango de la serie y límite de eventos
  await as("authenticated", A, `update event_series set end_date = '2099-04-15' where id = '${S1}'`, "NO se acorta la serie dejando fuera un evento (mayo)", "deny");
  await as("authenticated", A, `update event_series set start_date = '2099-03-15' where id = '${S1}'`, "NO se recorta el inicio dejando fuera un evento (marzo)", "deny");
  await as("authenticated", A, `update event_series set end_date = '2099-12-31', description = 'Nueva descripción' where id = '${S1}'`, "SÍ edita la serie sin dejar fuera a nadie", "some");
  await as("authenticated", B, `update event_series set name = 'hack' where id = '${S1}'`, "otro organizador NO edita la serie", "deny");
  await as("authenticated", A, `update event_series set organizer_id = '${B}' where id = '${S1}'`, "NO traspasa la serie a otro organizador", "deny");
  await as("authenticated", A, `update events set event_date = '2100-02-01' where id = '${E1}'`, "NO se mueve un evento de la serie fuera de su rango", "deny");
  await as("authenticated", A, `update events set event_date = '2099-03-20' where id = '${E1}'`, "SÍ se mueve un evento dentro del rango", "some");
  await as("authenticated", A, `update events set series_id = null where id = '${E1}'`, "NO se saca un evento de la serie con UPDATE directo", "deny");
  const many = Array.from({ length: 27 }, (_, i) => ev(10 + i, "2099-07-01"));
  await as("authenticated", A, add(many, false), "SÍ crea hasta 30 eventos en la serie (borradores)", "some");
  check("la serie tiene 30 eventos", await num(`select count(*) n from events where series_id = '${S1}'`) === 30);
  await as("authenticated", A, add([ev(40, "2099-08-01")]), "el evento 31 se rechaza", "deny");
  check("los borradores de la serie NO los ve el público", await num(`select count(*) n from events where series_id = '${S1}' and status = 'borrador'`) === 27);
  await as("anon", null, `select id from events where series_id = '${S1}'`, "el público solo ve los 3 publicados", "some");

  // Borrar eventos de la serie
  const D1 = ev(10, "2099-07-01").id;
  await as("authenticated", B, `select public.delete_series_event('${D1}')`, "otro organizador NO borra el evento", "deny");
  await as("authenticated", C, `select public.delete_series_event('${D1}')`, "un participante NO borra el evento", "deny");
  await as("anon", null, `select public.delete_series_event('${D1}')`, "anónimo NO borra el evento", "deny");
  await as("authenticated", A, `select public.delete_series_event('${E2}')`, "NO borra un evento que ya tiene inscritos", "deny");
  await as("authenticated", A, `select public.delete_series_event('e0000000-0000-0000-0000-000000000001')`, "NO borra un evento que no es de una serie", "deny");
  await as("authenticated", A, `select public.delete_series_event('${D1}')`, "SÍ borra un evento de su serie sin inscritos", "some");
  check("el evento ya no existe y se liberó su lugar en la serie", await num(`select count(*) n from events where id = '${D1}'`) === 0 && await num(`select count(*) n from events where series_id = '${S1}'`) === 29);
  await db.exec(`update events set status = 'finalizado' where id = '${ev(11, "2099-07-01").id}'`);
  await as("authenticated", A, `select public.delete_series_event('${ev(11, "2099-07-01").id}')`, "NO borra un evento finalizado", "deny");

  // Un evento de la serie sigue siendo un evento normal
  await as("authenticated", A, `update events set name = 'Fecha 1 editada', capacity = 120 where id = '${E1}'`, "el organizador edita un evento de la serie como cualquier otro", "some");
  await as("authenticated", C, `select public.register_for_event('${E1}', '${await kat(E1)}', 'header')`, "ya inscrito en esa categoría: se rechaza como en cualquier evento", "deny");

  // Borrar la serie (KIN-660): solo con la función, solo el dueño y solo cuando ya no tiene eventos
  await as("authenticated", A, `delete from event_series where id = '${S1}'`, "NO se borra la serie escribiendo la tabla directo", "deny");
  await as("authenticated", B, `select public.delete_series('${S1}')`, "otro organizador NO borra la serie", "deny");
  await as("authenticated", C, `select public.delete_series('${S1}')`, "un participante NO borra la serie", "deny");
  await as("anon", null, `select public.delete_series('${S1}')`, "anónimo NO borra la serie", "deny");
  await as("authenticated", A, `select public.delete_series('${S1}')`, "una serie con eventos NO se borra (has_events)", "deny");
  check("la serie y sus eventos siguen intactos", await num(`select count(*) n from event_series where id = '${S1}'`) === 1 && await num(`select count(*) n from events where series_id = '${S1}'`) >= 1);

  // Borrar un evento (KIN-660): motivo con inscritos, aviso a cada inscrito y constancia
  const EVB = "e0000000-0000-0000-0000-0000000000b6", KB = "ca000000-0000-0000-0000-0000000000b6", EVE = "e0000000-0000-0000-0000-0000000000b7";
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date, capacity) values ('${EVB}','Para borrar','${A}','publicado','para-borrar','2099-10-01', 20), ('${EVE}','Vacío para borrar','${A}','borrador','vacio-borrar','2099-10-02', 20);
    insert into event_categories (id, event_id, name, fee_cents) values ('${KB}','${EVB}','Libre',10000);
  `);
  await as("authenticated", C, `select public.register_for_event('${EVB}','${KB}', 'header')`, "C se inscribe al evento que se va a borrar", "some");
  await as("authenticated", B, `select public.delete_event('${EVB}', 'Se canceló por lluvia')`, "otro organizador NO borra un evento ajeno", "deny");
  await as("authenticated", C, `select public.delete_event('${EVB}', 'Se canceló por lluvia')`, "un participante NO borra el evento", "deny");
  await as("anon", null, `select public.delete_event('${EVB}', 'Se canceló por lluvia')`, "anónimo NO borra el evento", "deny");
  await as("authenticated", D, `select public.delete_event('${EVB}', 'Se canceló por lluvia')`, "ni un admin borra el evento de otro organizador", "deny");
  await as("authenticated", A, `select public.delete_event('${EVB}', '')`, "con inscritos, sin motivo NO se borra", "deny");
  await as("authenticated", A, `select public.delete_event('${EVB}', 'lluvia')`, "con inscritos, un motivo de menos de 10 caracteres NO se borra", "deny");
  await as("authenticated", A, `select public.delete_event('e0000000-0000-0000-0000-0000000000d2', 'Evento ya finalizado')`, "un evento finalizado NO se borra", "deny");
  check("el evento con inscritos sigue existiendo tras los intentos fallidos", await num(`select count(*) n from events where id = '${EVB}'`) === 1);
  await as("authenticated", A, `select public.delete_event('${EVB}', 'Se canceló por lluvia')`, "el dueño SÍ borra el evento con inscritos dando motivo", "some");
  check("el evento y sus inscripciones se borraron", await num(`select count(*) n from events where id = '${EVB}'`) === 0 && await num(`select count(*) n from registrations where event_id = '${EVB}'`) === 0);
  check("quedó constancia con motivo y número de inscritos", await num(`select count(*) n from deleted_events where event_id = '${EVB}' and enrolled_count = 1 and reason = 'Se canceló por lluvia' and deleted_by = '${A}'`) === 1);
  await as("authenticated", C, `select reason from notifications where kind = 'event_deleted' and event_name = 'Para borrar' and reason = 'Se canceló por lluvia'`, "el inscrito recibe el aviso del evento borrado con el motivo", "some");
  await as("authenticated", P2, `select id from notifications where event_name = 'Para borrar'`, "otro participante NO ve ese aviso", "deny");
  await as("authenticated", A, `select id from deleted_events`, "el organizador ve su constancia", "some");
  await as("authenticated", B, `select id from deleted_events`, "otro organizador NO ve constancias ajenas", "deny");
  await as("authenticated", A, `select public.delete_event('${EVE}', '')`, "sin inscritos, el dueño borra sin motivo", "some");
  check("sin inscritos no se manda ningún aviso", await num(`select count(*) n from notifications where event_name = 'Vacío para borrar'`) === 0);

  // Ya sin eventos, la serie sí se borra
  await db.exec(`delete from events where series_id = '${S1}'`);
  await as("authenticated", A, `select public.delete_series('${S1}')`, "el dueño SÍ borra la serie ya sin eventos", "some");
  check("la serie y su plantilla se borraron", await num(`select count(*) n from event_series where id = '${S1}'`) === 0 && await num(`select count(*) n from event_series_template where series_id = '${S1}'`) === 0);
}

// Resumen del organizador (KIN-658): solo con organizador activo y solo de lo suyo
{
  const n = async (sql) => Number((await db.query(sql)).rows[0].n);
  const overviewOf = async (who) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role authenticated`);
    const o = (await db.query("select public.organizer_overview() as o")).rows[0].o;
    await db.exec("reset role");
    return o;
  };
  await as("anon", null, `select public.organizer_overview()`, "anónimo NO ve el resumen del organizador", "deny");
  await as("authenticated", C, `select public.organizer_overview()`, "un participante NO ve el resumen del organizador", "deny");
  await as("authenticated", A, `select public.organizer_overview()`, "el organizador activo SÍ ve su resumen", "some");
  const o = await overviewOf(A);
  check("el resumen trae las secciones esperadas", ["series", "next_event", "payments", "states", "activity", "todo"].every((k) => k in o));
  check("el resumen no incluye eventos de otros organizadores", !JSON.stringify(o).includes("Evento Ajeno"));
  const total = await n(`select count(*) n from events where organizer_id = '${A}'`);
  const s = o.states;
  check("los estados no cuentan más eventos de los que tiene el organizador", s.open + s.scheduled + s.finished + s.draft <= total + 0 && s.draft >= 1);
  check("los pagos cuentan solo inscripciones de sus eventos", o.payments.pending + o.payments.paid === await n(`select count(*) n from registrations r join events e on e.id = r.event_id where e.organizer_id = '${A}' and r.payment_status in ('pendiente','pagado')`));
}

// ---- Tipo de sorteo y paquetes de tiros (KIN-648, KIN-649)
{
  console.log("\n— Tipo de sorteo y paquetes de tiros");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const EVD = "e9000000-0000-0000-0000-0000000000d1", EVL = "e9000000-0000-0000-0000-0000000000d2", EVN = "e9000000-0000-0000-0000-0000000000d3", EVO = "e9000000-0000-0000-0000-0000000000d4";
  const KD = "cb000000-0000-0000-0000-0000000000d1", KL = "cb000000-0000-0000-0000-0000000000d2", KN = "cb000000-0000-0000-0000-0000000000d3", KO = "cb000000-0000-0000-0000-0000000000d4";
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date, capacity, draw_type, lazada_shots_per_package, max_team_rating) values
      ('${EVD}','Round robin','${A}','publicado','rr-sorteo','2099-09-01',10,'round_robin',null,null),
      ('${EVL}','Lazada','${A}','publicado','lazada-sorteo','2099-09-02',10,'lazada_sorteada',3,12.5),
      ('${EVN}','Sin inscritos','${A}','borrador','sin-inscritos-sorteo','2099-09-03',10,'round_robin',null,null),
      ('${EVO}','Lazada del organizador','${A}','publicado','lazada-org','2099-09-04',10,'lazada_sorteada',2,null);
    insert into event_categories (id, event_id, name, fee_cents) values ('${KD}','${EVD}','Libre',10000), ('${KL}','${EVL}','Libre',10000), ('${KN}','${EVN}','Libre',10000), ('${KO}','${EVO}','Libre',10000);
  `);

  verify("los eventos que ya existían quedan en round_robin", await num(`select count(*) n from events where id = '${EV}' and draw_type = 'round_robin'`) === 1);
  verify("un evento nuevo sin tipo explícito es round_robin", await num(`select count(*) n from events where id = '${EVN}' and draw_type = 'round_robin' and lazada_shots_per_package is null`) === 1);
  verify("el tipo y los tiros por paquete son públicos en un evento publicado", await num(`select count(*) n from events where slug = 'lazada-sorteo' and draw_type = 'lazada_sorteada' and lazada_shots_per_package = 3`) === 1);

  // Creación y edición por el organizador (permisos por columna)
  await as("authenticated", A, "update events set draw_type = 'lazada_sorteada', lazada_shots_per_package = 4, max_team_rating = 11.5 where id = '" + EVN + "'", "el organizador SÍ cambia el tipo de un evento sin inscritos", "some");
  await as("authenticated", A, "update events set draw_type = 'round_robin' where id = '" + EVN + "'", "volver a round_robin con tiros por paquete se rechaza", "deny");
  await as("authenticated", A, "update events set draw_type = 'round_robin', lazada_shots_per_package = null where id = '" + EVN + "'", "volver a round_robin quitando los tiros por paquete SÍ se puede", "some");
  await as("authenticated", A, "update events set draw_type = 'draw_pot' where id = '" + EVN + "'", "un tipo que no existe se rechaza", "deny");
  await as("authenticated", A, "update events set draw_type = 'lazada_sorteada', lazada_shots_per_package = 0 where id = '" + EVN + "'", "tiros por paquete menores a 1 se rechazan", "deny");
  await as("authenticated", A, "update events set max_team_rating = 21 where id = '" + EVN + "'", "un tope por equipo fuera de 0 a 20 se rechaza", "deny");
  await as("authenticated", B, "update events set draw_type = 'lazada_sorteada' where id = '" + EVN + "'", "otro organizador NO cambia el tipo", "deny");
  await as("authenticated", C, "update events set draw_type = 'lazada_sorteada' where id = '" + EVN + "'", "un participante NO cambia el tipo", "deny");
  await as("anon", null, "update events set draw_type = 'lazada_sorteada' where id = '" + EVN + "'", "anónimo NO cambia el tipo", "deny");

  // Paquetes al inscribirse
  await as("authenticated", C, `select public.register_for_event('${EVD}','${KD}', 'header', 1)`, "round_robin: inscribirse sin paquetes (1) SÍ", "some");
  await as("authenticated", P2, `select public.register_for_event('${EVD}','${KD}', null, 3)`, "round_robin: pedir 3 paquetes se rechaza", "deny");
  await as("authenticated", C, `select public.register_for_event('${EVL}','${KL}', null, 0)`, "lazada: 0 paquetes se rechaza", "deny");
  await as("authenticated", C, `select public.register_for_event('${EVL}','${KL}', null, 100)`, "lazada: más de 99 paquetes se rechaza", "deny");
  await as("authenticated", C, `select public.register_for_event('${EVL}','${KL}', 'header', 3)`, "lazada: 3 paquetes SÍ", "some");
  verify("el monto es costo * paquetes y queda el número de paquetes", await num(`select count(*) n from registrations where event_id = '${EVL}' and packages = 3 and amount_cents = 30000`) === 1);
  await as("authenticated", P2, `select public.register_for_event('${EVL}','${KL}')`, "lazada: sin indicar paquetes queda en 1", "some");
  verify("sin indicar paquetes, el monto es el costo de la categoría", await num(`select count(*) n from registrations where event_id = '${EVL}' and packages = 1 and amount_cents = 10000`) === 1);
  await as("authenticated", A, `select public.organizer_enroll('${EVO}','p2@x.com','${KO}', null, 2)`, "el organizador inscribe con 2 paquetes", "some");
  verify("lo inscrito por el organizador cobra costo * paquetes", await num(`select count(*) n from registrations where event_id = '${EVO}' and packages = 2 and amount_cents = 20000`) === 1);
  await as("authenticated", A, `select public.organizer_enroll('${EVD}','p2@x.com','${KD}', null, 2)`, "el organizador NO inscribe con paquetes en round_robin", "deny");
  await as("authenticated", B, `select public.organizer_enroll('${EVO}','p2@x.com','${KO}', null, 2)`, "otro organizador NO inscribe en un evento ajeno", "deny");

  // Con inscritos, el tipo y los tiros por paquete ya no cambian; el tope por equipo sí
  await as("authenticated", A, "update events set draw_type = 'lazada_sorteada', lazada_shots_per_package = 2 where id = '" + EVD + "'", "con inscritos NO se cambia el tipo", "deny");
  await as("authenticated", A, "update events set lazada_shots_per_package = 5 where id = '" + EVL + "'", "con inscritos NO se cambian los tiros por paquete", "deny");
  await as("authenticated", A, "update events set max_team_rating = 10 where id = '" + EVL + "'", "con inscritos SÍ se puede ajustar el tope por equipo", "some");
  await as("authenticated", A, "update events set name = 'Lazada renombrada', draw_type = 'lazada_sorteada', lazada_shots_per_package = 3 where id = '" + EVL + "'", "guardar el mismo tipo y tiros (sin cambios) no estorba", "some");
  await db.exec(`insert into event_results (id, event_id, participant_name, discipline, time_ms, penalty_ms, disqualified) values (gen_random_uuid(), '${EVN}', 'Sin lazador', 'lazo', 9000, 0, false)`);
  await as("authenticated", A, "update events set draw_type = 'lazada_sorteada' where id = '" + EVN + "'", "con resultados NO se cambia el tipo", "deny");

  // La app recibe los paquetes de cada inscripción
  verify("app_organizer_events manda packages en cada inscripción", await num(`select count(*) n from public.app_organizer_events('${A}', null, now() + interval '1 minute', null, null, 50) e, jsonb_array_elements(e.registrations) r where e.id = '${EVL}' and (r->>'packages')::int = 3`) === 1);
}

// ---- Paquetes por lado con rol "Ambos" (KIN-793): cuántos paquetes como cabecero y cuántos como pialador, una inscripción por lado
{
  console.log("\n— Paquetes por lado (rol Ambos)");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const ev793 = (n) => `e7930000-0000-0000-0000-00000000000${n}`, kat793 = (n) => `ca793000-0000-0000-0000-00000000000${n}`;
  // 1 (2,0)  2 (1,1)  3 (0,3)  4 (0,0) y rechazos  5 round robin  6 cupo de 1 (lista de espera)  7 (2,3)  8 compatibilidad con la firma de siempre
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug, event_date, capacity, draw_type, lazada_shots_per_package) values
      ('${ev793(1)}','Lado 1','${A}','publicado','lado-793-1','2099-10-01',10,'lazada_sorteada',3),
      ('${ev793(2)}','Lado 2','${A}','publicado','lado-793-2','2099-10-02',10,'lazada_sorteada',3),
      ('${ev793(3)}','Lado 3','${A}','publicado','lado-793-3','2099-10-03',10,'lazada_sorteada',3),
      ('${ev793(4)}','Lado 4','${A}','publicado','lado-793-4','2099-10-04',10,'lazada_sorteada',3),
      ('${ev793(5)}','Lado round robin','${A}','publicado','lado-793-5','2099-10-05',10,'round_robin',null),
      ('${ev793(6)}','Lado cupo 1','${A}','publicado','lado-793-6','2099-10-06',1,'lazada_sorteada',3),
      ('${ev793(7)}','Lado 7','${A}','publicado','lado-793-7','2099-10-07',10,'lazada_sorteada',3),
      ('${ev793(8)}','Lado compatibilidad','${A}','publicado','lado-793-8','2099-10-08',10,'lazada_sorteada',3);
    insert into event_categories (id, event_id, name, fee_cents) values
      ('${kat793(1)}','${ev793(1)}','Libre',10000), ('${kat793(2)}','${ev793(2)}','Libre',10000), ('${kat793(3)}','${ev793(3)}','Libre',10000), ('${kat793(4)}','${ev793(4)}','Libre',10000),
      ('${kat793(5)}','${ev793(5)}','Libre',10000), ('${kat793(6)}','${ev793(6)}','Libre',10000), ('${kat793(7)}','${ev793(7)}','Libre',10000), ('${kat793(8)}','${ev793(8)}','Libre',10000);
    update ropers set primary_role = 'both', favorite_role = 'header' where user_id = '${C}';
    update ropers set primary_role = 'header', favorite_role = null where user_id = '${P2}';
  `);
  const side = (e, h, l) => `select public.register_for_event_by_side('${ev793(e)}', '${kat793(e)}', ${h}, ${l})`;
  const rows = (e) => `select role, packages, amount_cents from registrations where event_id = '${ev793(e)}' and roper_id in (select id from ropers where user_id = '${C}') order by role`;

  // Dos paquetes de cabecero y ninguno de pialador: UNA inscripción
  await as("authenticated", C, side(1, 2, 0), "Ambos: 2 paquetes de cabecero y 0 de pialador SÍ", "some");
  verify("queda una sola inscripción, de cabecero, con 2 paquetes y 2 * el costo", JSON.stringify((await db.query(rows(1))).rows) === JSON.stringify([{ role: "header", packages: 2, amount_cents: 20000 }]));
  // Uno de cada lado: DOS inscripciones, cada una con sus paquetes y su monto; el total a pagar es la suma
  await as("authenticated", C, side(2, 1, 1), "Ambos: 1 paquete de cada lado SÍ", "some");
  verify("quedan dos inscripciones (cabecero y pialador), 1 paquete y el costo cada una", JSON.stringify((await db.query(rows(2))).rows) === JSON.stringify([{ role: "header", packages: 1, amount_cents: 10000 }, { role: "heeler", packages: 1, amount_cents: 10000 }]));
  // Cada lado con su propio número: 0 de cabecero y 3 de pialador
  await as("authenticated", C, side(3, 0, 3), "Ambos: 0 de cabecero y 3 de pialador SÍ", "some");
  verify("solo hay inscripción de pialador, con 3 paquetes y 3 * el costo", JSON.stringify((await db.query(rows(3))).rows) === JSON.stringify([{ role: "heeler", packages: 3, amount_cents: 30000 }]));
  await as("authenticated", C, side(7, 2, 3), "Ambos: 2 de cabecero y 3 de pialador (números distintos) SÍ", "some");
  verify("cada lado guarda SUS paquetes y el total a pagar es la suma (5 * el costo)", JSON.stringify((await db.query(rows(7))).rows) === JSON.stringify([{ role: "header", packages: 2, amount_cents: 20000 }, { role: "heeler", packages: 3, amount_cents: 30000 }]));

  // Validaciones
  await as("authenticated", C, side(4, 0, 0), "0 y 0: el total debe ser al menos 1", "deny");
  await as("authenticated", C, side(4, -1, 2), "un lado negativo se rechaza", "deny");
  await as("authenticated", C, side(4, 100, 0), "más de 99 en un lado se rechaza", "deny");
  await as("authenticated", C, side(4, "null", 1), "un lado sin valor se rechaza", "deny");
  verify("lo rechazado no dejó inscripciones", await num(`select count(*) n from registrations where event_id = '${ev793(4)}'`) === 0);
  await as("authenticated", C, side(5, 1, 1), "en un evento que no es Lazada Sorteada NO hay paquetes por lado", "deny");
  // El rol se elige al inscribirse, sin importar el del perfil: un perfil de solo cabecero también puede inscribirse de pialador o de los dos
  const rowsOf = (e, user) => `select role, packages, amount_cents from registrations where event_id = '${ev793(e)}' and roper_id in (select id from ropers where user_id = '${user}') order by role`;
  await as("authenticated", P2, side(2, 0, 2), "perfil de solo cabecero: SÍ se inscribe de pialador con 2 paquetes", "some");
  verify("queda de pialador con 2 paquetes y el perfil NO cambia (sigue cabecero)", JSON.stringify((await db.query(rowsOf(2, P2))).rows) === JSON.stringify([{ role: "heeler", packages: 2, amount_cents: 20000 }]) && await num(`select count(*) n from ropers where user_id = '${P2}' and primary_role = 'header'`) === 1);
  await as("authenticated", P2, side(3, 1, 2), "perfil de solo cabecero: SÍ se inscribe de los dos lados (1 y 2)", "some");
  verify("quedan sus dos inscripciones, cada una con SUS paquetes", JSON.stringify((await db.query(rowsOf(3, P2))).rows) === JSON.stringify([{ role: "header", packages: 1, amount_cents: 10000 }, { role: "heeler", packages: 2, amount_cents: 20000 }]));
  await db.exec(`update ropers set primary_role = 'heeler', favorite_role = null where user_id = '${P2}'`);
  await as("authenticated", P2, side(1, 3, 0), "perfil de solo pialador: SÍ se inscribe de cabecero", "some");
  await db.exec(`update ropers set primary_role = null, favorite_role = null where user_id = '${P2}'`);
  await as("authenticated", P2, side(7, 0, 1), "perfil sin rol definido: SÍ se inscribe eligiendo su lado", "some");
  verify("y la inscripción lleva el rol elegido", JSON.stringify((await db.query(rowsOf(7, P2))).rows) === JSON.stringify([{ role: "heeler", packages: 1, amount_cents: 10000 }]));
  await db.exec(`update ropers set primary_role = 'header', favorite_role = null where user_id = '${P2}'`);
  await as("authenticated", D, side(4, 1, 0), "una cuenta sin perfil de lazador NO se inscribe", "deny");
  await as("anon", null, side(4, 1, 0), "anónimo NO se inscribe", "deny");
  await as("authenticated", C, side(1, 1, 0), "repetir el mismo lado en la misma categoría se rechaza (already)", "deny");
  await as("authenticated", C, side(1, 0, 2), "pero el lado que faltaba SÍ se puede agregar después", "some");
  verify("y queda cada lado con sus paquetes", JSON.stringify((await db.query(rows(1))).rows) === JSON.stringify([{ role: "header", packages: 2, amount_cents: 20000 }, { role: "heeler", packages: 2, amount_cents: 20000 }]));
  await as("authenticated", C, side(1, 1, 1), "con los dos lados ya inscritos, repetir se rechaza", "deny");

  // Cupo: el cupo cuenta inscripciones, así que uno de cada lado ocupa 2 lugares y es todo o nada
  await as("authenticated", C, side(6, 1, 1), "con cupo de 1, dos lados NO caben (full)", "deny");
  verify("todo o nada: no se creó ninguna", await num(`select count(*) n from registrations where event_id = '${ev793(6)}'`) === 0);
  await as("authenticated", C, side(6, 0, 2), "con cupo de 1, un solo lado SÍ", "some");

  // Lista de espera: solo si el evento está lleno; una fila por lado con sus paquetes
  await db.exec(`update ropers set primary_role = 'both', favorite_role = 'header' where user_id = '${P2}'`);
  const wait = (e, h, l) => `select public.join_waitlist_by_side('${ev793(e)}', '${kat793(e)}', ${h}, ${l})`;
  await as("authenticated", P2, wait(4, 1, 1), "con lugar en el evento NO entra a espera (not_full)", "deny");
  await as("authenticated", P2, wait(6, 0, 0), "espera: 0 y 0 se rechaza", "deny");
  await as("authenticated", P2, wait(6, 2, 3), "espera: 2 de cabecero y 3 de pialador SÍ (evento lleno)", "some");
  verify("hay una fila de espera por lado con sus paquetes", JSON.stringify((await db.query(`select role, packages from event_waitlist where event_id = '${ev793(6)}' order by role`)).rows) === JSON.stringify([{ role: "header", packages: 2 }, { role: "heeler", packages: 3 }]));
  await as("authenticated", P2, wait(6, 1, 0), "estar ya en la espera de ese lado se rechaza (already)", "deny");
  await as("authenticated", C, wait(6, 0, 1), "quien ya está inscrito en ese lado NO entra a la espera", "deny");
  await as("anon", null, wait(6, 1, 0), "anónimo NO entra a la espera", "deny");
  await db.exec(`update ropers set primary_role = 'header', favorite_role = null where user_id = '${P2}'`);

  // La app recibe una inscripción por rol, cada una con su role y sus packages (sin cambios en el contrato)
  verify("app_organizer_events manda una inscripción por rol con su role y packages", await num(`select count(*) n from public.app_organizer_events('${A}', null, now() + interval '1 minute', null, null, 50) e, jsonb_array_elements(e.registrations) r where e.id = '${ev793(7)}' and ((r->>'role' = 'header' and (r->>'packages')::int = 2) or (r->>'role' = 'heeler' and (r->>'packages')::int = 3))`) === 2);

  // Compatibilidad: la función de siempre sigue igual (mismos paquetes en cada rol con "los dos")
  await as("authenticated", C, `select public.register_for_event('${ev793(8)}', '${kat793(8)}', 'both', 2)`, "la función de siempre con \"los dos\" sigue funcionando", "some");
  verify("y sigue poniendo los mismos paquetes en cada rol", JSON.stringify((await db.query(rows(8))).rows) === JSON.stringify([{ role: "header", packages: 2, amount_cents: 20000 }, { role: "heeler", packages: 2, amount_cents: 20000 }]));
}

// ---- Ciclo de vida de los avisos (KIN-772): vistos expiran a los 90 días, no vistos al año, los de reembolso pendiente nunca; lo vencido se esconde y se limpia
{
  console.log("\n— Ciclo de vida de los avisos");
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  // Como la persona con sesión: lo que ve de verdad (las reglas de la base se aplican)
  const seen = async (uid, sql = "select event_name, read_at is null as unread from notifications order by event_name") => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated`);
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const names = (rows) => rows.map((r) => r.event_name).sort();
  const ago = (interval) => `now() - interval '${interval}'`;
  // (nombre, creado, leído) de la persona C. `refund` marca los de reembolso pendiente.
  const notice = (user, name, created, read, refund = false) =>
    `insert into notifications (user_id, kind, event_name, refund_pending, created_at, read_at) values ('${user}', 'removed', '${name}', ${refund}, ${created}, ${read})`;
  await db.exec(`delete from notifications; ${[
    notice(C, "visto-10-dias", ago("30 days"), ago("10 days")),
    notice(C, "visto-89-dias", ago("200 days"), ago("89 days")),
    notice(C, "visto-91-dias", ago("200 days"), ago("91 days")),
    notice(C, "visto-100-dias", ago("300 days"), ago("100 days")),
    notice(C, "nuevo-reciente", ago("2 days"), "null"),
    notice(C, "nuevo-11-meses", ago("335 days"), "null"),
    notice(C, "nuevo-13-meses", ago("400 days"), "null"),
    notice(C, "nuevo-2-anios", ago("730 days"), "null"),
    notice(C, "reembolso-visto-200-dias", ago("400 days"), ago("200 days"), true),
    notice(C, "reembolso-nuevo-3-anios", ago("1100 days"), "null", true),
    notice(P2, "de-otra-persona-reciente", ago("1 day"), "null"),
    notice(P2, "de-otra-persona-vencido", ago("500 days"), ago("400 days")),
  ].join("; ")}`);

  // La regla (un solo lugar): los límites de los 90 días y del año, y la excepción del reembolso
  const expired = async (read, created, refund = false) => (await db.query(`select private.notification_expired(${read}, ${created}, ${refund}) as e`)).rows[0].e;
  verify("visto hace 89 días: no ha expirado; hace 91: sí", !(await expired(ago("89 days"), ago("1 year"))) && (await expired(ago("91 days"), ago("1 year"))));
  verify("no visto de 364 días: no ha expirado; de 366: sí", !(await expired("null", ago("364 days"))) && (await expired("null", ago("366 days"))));
  verify("un aviso nuevo (hoy, visto o no) no ha expirado", !(await expired("null", "now()")) && !(await expired("now()", "now()")));
  verify("con reembolso pendiente nunca expira (visto o no)", !(await expired(ago("5 years"), ago("6 years"), true)) && !(await expired("null", ago("6 years"), true)));

  // Lectura: lo vencido ya no se ve; lo vigente, lo no visto reciente y lo de reembolso siguen
  const mine = await seen(C);
  verify("la persona ve solo lo vigente (y lo de reembolso pendiente aunque sea viejo)", JSON.stringify(names(mine)) === JSON.stringify(["nuevo-11-meses", "nuevo-reciente", "reembolso-nuevo-3-anios", "reembolso-visto-200-dias", "visto-10-dias", "visto-89-dias"].sort()));
  verify("lo vencido (visto de 91 y 100 días, no visto de 13 meses y 2 años) ya no sale", !names(mine).some((n) => ["visto-91-dias", "visto-100-dias", "nuevo-13-meses", "nuevo-2-anios"].includes(n)));
  verify("el contador de no vistas no cuenta lo vencido (3 no vistos vigentes)", mine.filter((r) => r.unread).length === 3);
  verify("sigue viendo solo lo suyo (nada de la otra persona)", !names(mine).some((n) => n.startsWith("de-otra-persona")));
  const other = await seen(P2);
  verify("la otra persona ve su aviso vigente y no el vencido ni los ajenos", JSON.stringify(names(other)) === JSON.stringify(["de-otra-persona-reciente"]));
  await as("authenticated", D, "select id from notifications", "una tercera persona no ve avisos ajenos", "deny");
  await as("anon", null, "select id from notifications", "anónimo NO ve avisos", "deny");
  // Un aviso vencido ya no se puede ni marcar como leído (no se ve); uno vigente sí
  await as("authenticated", C, "update notifications set read_at = now() where event_name = 'nuevo-2-anios'", "un aviso vencido ya no se puede tocar", "deny");
  await as("authenticated", C, "update notifications set read_at = now() where event_name = 'nuevo-reciente'", "un aviso vigente SÍ se marca como leído", "some");
  await as("authenticated", C, "update notifications set read_at = now() where event_name = 'de-otra-persona-reciente'", "el aviso de otra persona NO se marca", "deny");
  await db.exec("update notifications set read_at = null where event_name = 'nuevo-reciente'");

  // Limpieza: solo el administrador de la base la corre; borra lo vencido y nada más; repetirla no hace nada
  await as("authenticated", C, "select private.purge_expired_notifications()", "una persona con sesión NO corre la limpieza", "deny");
  await as("authenticated", A, "select private.purge_expired_notifications()", "ni un organizador", "deny");
  await as("anon", null, "select private.purge_expired_notifications()", "ni anónimo", "deny");
  await db.exec("reset role"); // el administrador de la base (el programador de pg_cron o el SQL Editor)
  const finance = (await db.query("select (select count(*) from registration_removals) as r, (select count(*) from deleted_events) as d")).rows[0];
  const first = Number((await db.query("select private.purge_expired_notifications() as n")).rows[0].n);
  verify("la primera limpieza borra los 5 vencidos (4 de C y 1 de la otra persona)", first === 5);
  const left = (await db.query("select event_name from notifications order by event_name")).rows.map((r) => r.event_name);
  verify("quedan los vigentes y los de reembolso pendiente", JSON.stringify(left) === JSON.stringify(["de-otra-persona-reciente", "nuevo-11-meses", "nuevo-reciente", "reembolso-nuevo-3-anios", "reembolso-visto-200-dias", "visto-10-dias", "visto-89-dias"]));
  verify("los avisos con reembolso pendiente siguen ahí", left.includes("reembolso-nuevo-3-anios") && left.includes("reembolso-visto-200-dias"));
  const second = Number((await db.query("select private.purge_expired_notifications() as n")).rows[0].n);
  verify("es idempotente: la segunda limpieza no borra nada", second === 0 && Number((await db.query("select count(*) n from notifications")).rows[0].n) === 7);
  verify("lo financiero (retiros y eventos borrados) no se toca al limpiar avisos", JSON.stringify(finance) === JSON.stringify((await db.query("select (select count(*) from registration_removals) as r, (select count(*) from deleted_events) as d")).rows[0]));

  // Regresión: la campana y la lista de la persona siguen mostrando lo vigente después de limpiar
  verify("tras limpiar, la persona sigue viendo sus 6 avisos vigentes", (await seen(C)).length === 6);
  await db.exec("delete from notifications");
}

// ---- Ciclo de vida y visibilidad de los eventos (KIN-769): estado (borrador, publicado, finalizado) x visibilidad (público, privado) contra cada tipo de persona
{
  console.log("\n— Estado y visibilidad de los eventos");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const asRows = async (role, uid, sql) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role}`);
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const E = (n) => `e7690000-0000-0000-0000-00000000000${n}`, K = (n) => `ca769000-0000-0000-0000-00000000000${n}`;
  // 1 público  2 privado  3 privado con lista de espera  4 borrador privado  5 borrador público  6 finalizado privado  7 finalizado público
  const spec = [[1, "pub", "publicado", "publico"], [2, "priv", "publicado", "privado"], [3, "wait", "publicado", "privado"], [4, "draftprv", "borrador", "privado"],
    [5, "draftpub", "borrador", "publico"], [6, "finpriv", "finalizado", "privado"], [7, "finpub", "finalizado", "publico"]];
  const PA = `(select id from ropers where user_id = '${C}')`, PB = `(select id from ropers where user_id = '${P2}')`;
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`); // sembrar como administrador de la base: sin la sesión que dejó la prueba anterior
  await db.exec(`update profiles set license_valid_until = 'infinity' where user_id in ('${A}', '${B}')`);
  for (const [n, slug, status, visibility] of spec) {
    await db.exec(`
      insert into events (id, name, organizer_id, status, slug, event_date, capacity, visibility) values ('${E(n)}', 'V769 ${slug}', '${A}', '${status}', 'v769-${slug}', '2099-11-0${n}', 10, '${visibility}');
      insert into event_categories (id, event_id, name, fee_cents) values ('${K(n)}', '${E(n)}', 'Libre', 10000);
      insert into event_photos (event_id, storage_path) values ('${E(n)}', 'v769/${n}.jpg');
      insert into event_results (id, event_id, participant_name, discipline, time_ms, penalty_ms, disqualified) values (gen_random_uuid(), '${E(n)}', 'Resultado ${slug}', 'lazo', 9000, 0, false);
    `);
  }
  // C está inscrito en el público y en el privado (2); P2 espera en el privado con lista de espera (3)
  await db.exec(`
    insert into registrations (event_id, roper_id, category_id, amount_cents) values ('${E(1)}', ${PA}, '${K(1)}', 10000), ('${E(2)}', ${PA}, '${K(2)}', 10000);
    insert into event_waitlist (event_id, roper_id, category_id) values ('${E(3)}', ${PB}, '${K(3)}');
  `);

  // El modelo: todo lo que ya existía quedó público, y solo se acepta público o privado
  verify("los eventos que ya existían quedaron 'público' (nada cambia para ellos)", await num(`select count(*) n from events where visibility <> 'publico' and slug not like 'v769-%'`) === 0);
  let rejected = false;
  try { await db.exec(`update events set visibility = 'secreto' where id = '${E(1)}'`); } catch { rejected = true; }
  verify("una visibilidad que no existe se rechaza", rejected);
  // La visibilidad se elige SOLO al crear el evento (ventana de «Publicar», migración 0058): después no se cambia desde la web
  await as("authenticated", A, `update events set visibility = 'privado' where id = '${E(1)}'`, "el organizador NO cambia la visibilidad de un evento ya creado", "deny");
  await as("authenticated", A, `update events set visibility = 'publico' where organizer_id = '${A}' and visibility = 'privado'`, "ni lo vuelve a público (sin permiso de UPDATE)", "deny");
  await as("authenticated", A, `insert into events (id, name, organizer_id, status, slug, visibility) values ('e7690000-0000-0000-0000-0000000000f1', 'W769 creado privado', '${A}', 'publicado', 'w769-privado', 'privado')`, "el organizador SÍ crea su evento ya privado", "some");
  verify("queda privado y publicado", await num(`select count(*) n from events where slug = 'w769-privado' and visibility = 'privado' and status = 'publicado'`) === 1);
  verify("y sin sesión no existe (ni en el listado ni por su dirección)", (await asRows("anon", null, `select slug from events where slug = 'w769-privado'`)).length === 0);
  verify("otro organizador tampoco lo ve", (await asRows("authenticated", B, `select slug from events where slug = 'w769-privado'`)).length === 0);
  verify("su organizador sí lo ve", (await asRows("authenticated", A, `select slug from events where slug = 'w769-privado'`)).length === 1);
  await as("authenticated", A, `insert into events (id, name, organizer_id, status, slug, visibility) values (gen_random_uuid(), 'W769 raro', '${A}', 'publicado', 'w769-raro', 'secreto')`, "una visibilidad que no existe se rechaza al crear", "deny");
  await as("authenticated", B, `insert into events (id, name, organizer_id, status, slug, visibility) values (gen_random_uuid(), 'W769 a nombre de otro', '${A}', 'publicado', 'w769-ajeno', 'privado')`, "NO crea un evento privado a nombre de otro organizador", "deny");
  await db.exec(`delete from events where slug like 'w769-%'`);

  // Quién ve cada evento (lectura por política): sin sesión, otro participante, otro organizador, el inscrito, el que espera y el dueño
  const seesEvents = async (role, uid) => (await asRows(role, uid, `select slug from events where slug like 'v769-%' order by slug`)).map((r) => r.slug.replace("v769-", ""));
  const same = (got, want) => JSON.stringify(got) === JSON.stringify([...want].sort());
  const anon = await seesEvents("anon", null);
  verify("sin sesión: solo lo público publicado o finalizado (ni borradores ni privados)", same(anon, ["pub", "finpub"]));
  verify("otro organizador ve lo mismo que el público", same(await seesEvents("authenticated", B), ["pub", "finpub"]));
  verify("un participante sin relación con los privados ve lo mismo que el público", same(await seesEvents("authenticated", D), ["pub", "finpub"]));
  verify("el inscrito ve su evento privado (y lo público), no los demás privados", same(await seesEvents("authenticated", C), ["pub", "priv", "finpub"]));
  verify("quien está en la lista de espera de un privado también lo ve", same(await seesEvents("authenticated", P2), ["pub", "wait", "finpub"]));
  verify("el organizador ve todo lo suyo (borradores y privados incluidos)", same(await seesEvents("authenticated", A), spec.map((s) => s[1])));

  // Lo que cuelga del evento sigue al evento: categorías, fotos y resultados
  const countFor = (table, role, uid) => asRows(role, uid, `select count(*)::int n from ${table} where event_id::text like 'e7690000%'`).then((r) => r[0].n);
  for (const table of ["event_categories", "event_photos", "event_results"]) {
    const [a, b, c, p2, o] = [await countFor(table, "anon", null), await countFor(table, "authenticated", B), await countFor(table, "authenticated", C), await countFor(table, "authenticated", P2), await countFor(table, "authenticated", A)];
    verify(`${table}: público 2, otro organizador 2, inscrito 3, en espera 3, dueño 7`, a === 2 && b === 2 && c === 3 && p2 === 3 && o === 7);
  }

  // Funciones públicas de inscritos y conteos (saltan RLS): también respetan la visibilidad
  const callN = async (role, uid, sql) => (await asRows(role, uid, sql)).length;
  verify("event_enrolled: del privado, sin sesión 0 y el inscrito 1", (await asRows("anon", null, `select public.event_enrolled('v769-priv') n`))[0].n === 0 && (await asRows("authenticated", C, `select public.event_enrolled('v769-priv') n`))[0].n === 1);
  verify("event_enrolled: del público lo ve cualquiera", (await asRows("anon", null, `select public.event_enrolled('v769-pub') n`))[0].n === 1);
  verify("event_registrants: del privado, sin sesión y otro organizador 0; el inscrito 1", await callN("anon", null, `select * from public.event_registrants('${E(2)}')`) === 0 && await callN("authenticated", B, `select * from public.event_registrants('${E(2)}')`) === 0 && await callN("authenticated", C, `select * from public.event_registrants('${E(2)}')`) === 1);
  verify("event_registrants_page: igual (sin sesión 0, el inscrito 1)", await callN("anon", null, `select * from public.event_registrants_page('${E(2)}', 'lazo', 1)`) === 0 && await callN("authenticated", C, `select * from public.event_registrants_page('${E(2)}', 'lazo', 1)`) === 1);
  const countsOf = async (role, uid) => (await asRows(role, uid, `select event_id from public.event_registration_counts() where event_id::text like 'e7690000%' order by 1`)).map((r) => r.event_id);
  verify("event_registration_counts: el público no cuenta el privado; el inscrito sí", same((await countsOf("anon", null)).map((id) => id.slice(-1)), ["1"]) && same((await countsOf("authenticated", C)).map((id) => id.slice(-1)), ["1", "2"]));
  const waitOf = async (role, uid) => (await asRows(role, uid, `select event_id from public.event_waitlist_counts() where event_id::text like 'e7690000%'`)).length;
  verify("event_waitlist_counts: la espera de un privado solo la ve quien puede ver el evento", await waitOf("anon", null) === 0 && await waitOf("authenticated", C) === 0 && await waitOf("authenticated", P2) === 1 && await waitOf("authenticated", A) === 1);

  // Escritura: nadie entra a un evento que no puede ver (guarda en inscripciones y lista de espera, sirve para toda función que inserte)
  const insertAs = async (uid, sql) => {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
    try { await db.exec(sql); return "ok"; } catch (e) { return String(e.message); } finally { await db.exec("select set_config('request.jwt.claim.sub', '', false)"); }
  };
  const reg = (n) => `insert into registrations (event_id, roper_id, category_id, amount_cents) values ('${E(n)}', ${PB}, '${K(n)}', 10000)`;
  verify("con sesión, inscribirse a un privado que no ve se rechaza (not_found)", (await insertAs(P2, reg(2))).includes("not_found"));
  verify("con sesión, entrar a la espera de un privado que no ve se rechaza", (await insertAs(B, `insert into event_waitlist (event_id, roper_id, category_id) values ('${E(2)}', ${PB}, '${K(2)}')`)).includes("not_found"));
  verify("no quedó ninguna inscripción nueva", await num(`select count(*) n from registrations where event_id = '${E(2)}'`) === 1);
  await as("authenticated", P2, `select public.register_for_event('${E(2)}', '${K(2)}')`, "la función de inscribirse tampoco deja entrar a un privado", "deny");
  verify("sin sesión (el servidor) la guarda no estorba", (await insertAs(null, reg(2))) === "ok");
  await db.exec(`delete from registrations where event_id = '${E(2)}' and roper_id = ${PB}`);
  verify("a un evento público se inscribe como siempre", (await insertAs(P2, reg(1))) === "ok");
  await db.exec(`delete from registrations where event_id = '${E(1)}' and roper_id = ${PB}`);
  await as("authenticated", A, `select public.organizer_enroll('${E(2)}', 'p2@x.com', '${K(2)}', null, 1)`, "el organizador SÍ inscribe a mano en su evento privado", "some");
  verify("y esa persona ya ve el privado", same(await seesEvents("authenticated", P2), ["pub", "priv", "wait", "finpub"]));

  // Finalización automática: la regla de SQL (event_phase) da lo mismo que la de la web (statusByDate), también en las orillas de zona horaria
  const zones = ["America/Mexico_City", "Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"];
  let mismatches = 0, cases = 0;
  for (const tz of zones) {
    const today = (await db.query(`select (now() at time zone $1)::date::text d`, [tz])).rows[0].d;
    for (const offset of [-400, -3, -1, 0, 1, 5]) {
      const date = (await db.query(`select ($1::date + $2::int)::text d`, [today, offset])).rows[0].d;
      for (const status of ["borrador", "publicado", "finalizado"]) {
        cases++;
        const sql = (await db.query(`select public.event_phase($1, $2::date, $3) p`, [status, date, tz])).rows[0].p;
        if (sql !== statusByDate({ status, date, timezone: tz })) { mismatches++; console.log(`   distinto: ${status} ${date} ${tz}: sql=${sql} web=${statusByDate({ status, date, timezone: tz })}`); }
      }
    }
  }
  verify(`event_phase (SQL) y statusByDate (web) coinciden en ${cases} casos (estados, fechas y zonas horarias)`, mismatches === 0);
  verify("un publicado con fecha de ayer es finalizado; de hoy o de mañana, publicado", (await db.query(`select public.event_phase('publicado', (now() at time zone 'UTC')::date - 1, 'UTC') a, public.event_phase('publicado', (now() at time zone 'UTC')::date, 'UTC') b, public.event_phase('publicado', (now() at time zone 'UTC')::date + 1, 'UTC') c`)).rows[0].a === "finalizado");
  verify("un borrador nunca se finaliza solo, y sin fecha no hay nada que vencer", (await db.query(`select public.event_phase('borrador', date '2000-01-01', 'UTC') a, public.event_phase('publicado', null, 'UTC') b`)).rows[0].a === "borrador" && (await db.query(`select public.event_phase('publicado', null, 'UTC') b`)).rows[0].b === "publicado");
  // El resumen del organizador (KIN-658) repite la regla en SQL: debe contar como finalizados los mismos eventos
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${A}', false); set role authenticated`);
  const overview = (await db.query("select public.organizer_overview() as o")).rows[0].o;
  await db.exec("reset role");
  verify("el resumen del organizador cuenta como finalizados los mismos eventos que event_phase", overview.states.finished === await num(`select count(*) n from events where organizer_id = '${A}' and public.event_phase(status, event_date, timezone) = 'finalizado'`));

  // Limpieza de lo que sembró este bloque
  await db.exec(`delete from events where slug like 'v769-%'`);
}

// ---- Eventos que la app sube a la web (KIN-648, entrega 2)
{
  console.log("\n— Eventos subidos desde la app");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const svc = async (sql, params = []) => { await db.exec("reset role; set role service_role"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); } };
  const upload = (org, series, event) => svc("select * from public.app_upload_event($1::uuid, $2::jsonb, $3::jsonb)", [org, series ? JSON.stringify(series) : null, JSON.stringify(event)]);
  const denied = async (fn) => { try { await fn(); return false; } catch { return true; } };
  const APPEV = "a9000000-0000-0000-0000-0000000000a1", APPEV2 = "a9000000-0000-0000-0000-0000000000a2", APPEV3 = "a9000000-0000-0000-0000-0000000000a3", APPSER = "a9000000-0000-0000-0000-0000000000b1";
  const event = (id, extra = {}) => ({ app_id: id, slug: `app-${id.slice(-2)}-abcd`, name: "Lazada de la app", date: "2099-10-10", venue: "Lienzo", disciplines: ["lazo"], draw_type: "lazada_sorteada", shots: 4, rounds: 5, max_roper_rating: 6.5, max_team_rating: 12, entry_fee_cents: 50000, ...extra });
  const series = { app_id: APPSER, slug: "serie-app-abcd", name: "Temporada de la app", start_date: "2099-01-01", end_date: "2099-12-31" };

  const first = (await upload(A, series, event(APPEV)))[0];
  verify("la primera subida crea el evento y la serie", first.r_event_created === true && first.r_series_created === true && !!first.r_event_id && !!first.r_series_id);
  verify("el evento nace como BORRADOR con el tipo de sorteo, tiros y topes de la app", await num(`select count(*) n from events where id = '${first.r_event_id}' and status = 'borrador' and draw_type = 'lazada_sorteada' and lazada_shots_per_package = 4 and max_roper_rating = 6.5 and max_team_rating = 12 and organizer_id = '${A}'`) === 1);
  verify("lo que la app no tiene queda vacío (ciudad '', sede de la app, sin cupo) y entra en la serie", await num(`select count(*) n from events where id = '${first.r_event_id}' and city = '' and venue = 'Lienzo' and capacity is null and series_id = '${first.r_series_id}' and disciplines = array['lazo']`) === 1);
  verify("las rondas de la app se guardan en el evento", await num(`select count(*) n from events where id = '${first.r_event_id}' and rounds = 5`) === 1);
  verify("trae una categoría General con la cuota de la app", await num(`select count(*) n from event_categories where event_id = '${first.r_event_id}' and name = 'General' and fee_cents = 50000`) === 1);
  verify("la serie nace con plantilla vacía y el nombre del organizador", await num(`select count(*) n from event_series s join event_series_template t on t.series_id = s.id where s.id = '${first.r_series_id}' and t.city = '' and t.capacity is null and s.organizer_name is not null`) === 1);

  const again = (await upload(A, series, event(APPEV, { name: "Otro nombre", slug: "otro-slug-zzzz", shots: 9 })))[0];
  verify("reenviar el mismo evento devuelve el mismo id y slug, sin crear nada", again.r_event_id === first.r_event_id && again.r_event_slug === first.r_event_slug && again.r_event_created === false && again.r_series_created === false);
  verify("reenviar NO modifica el evento (la web manda después de crearse)", await num(`select count(*) n from events where id = '${first.r_event_id}' and name = 'Lazada de la app' and lazada_shots_per_package = 4`) === 1);
  verify("no se duplicó el evento, la serie ni la categoría", await num(`select count(*) n from events where app_event_id = '${APPEV}'`) === 1 && await num(`select count(*) n from event_series where app_series_id = '${APPSER}'`) === 1 && await num(`select count(*) n from event_categories where event_id = '${first.r_event_id}'`) === 1);

  const second = (await upload(A, series, event(APPEV2, { rounds: null, draw_type: "round_robin", shots: null, max_team_rating: null, max_roper_rating: null, entry_fee_cents: 0 })))[0];
  verify("otro evento de la misma serie reutiliza la serie (vinculada por id, no por nombre)", second.r_event_created === true && second.r_series_created === false && second.r_series_id === first.r_series_id);
  verify("sin rondas en la subida, el evento queda con rondas nulas", await num(`select count(*) n from events where id = '${second.r_event_id}' and rounds is null`) === 1);
  verify("un evento round_robin sin topes ni cuota se guarda tal cual", await num(`select count(*) n from events where id = '${second.r_event_id}' and draw_type = 'round_robin' and lazada_shots_per_package is null and max_roper_rating is null and max_team_rating is null`) === 1);

  const byId = (await upload(A, { ...series, id: first.r_series_id, app_id: "a9000000-0000-0000-0000-0000000000b9", slug: "no-se-usa-abcd" }, event("a9000000-0000-0000-0000-0000000000a5")))[0];
  verify("con series.id (la serie ya conocida en la web) se usa esa serie y no se crea otra", byId.r_event_created === true && byId.r_series_created === false && byId.r_series_id === first.r_series_id && await num(`select count(*) n from event_series where organizer_id = '${A}' and app_series_id = 'a9000000-0000-0000-0000-0000000000b9'`) === 0);
  verify("series.id de OTRO organizador se rechaza (series_not_found) y no crea el evento", await denied(() => upload(B, { ...series, id: first.r_series_id }, event("a9000000-0000-0000-0000-0000000000a6", { slug: "app-b2-abcd" }))) && await num(`select count(*) n from events where app_event_id = 'a9000000-0000-0000-0000-0000000000a6'`) === 0);

  const loose = (await upload(A, null, event(APPEV3, { date: "2101-01-01" })))[0];
  verify("un evento suelto (sin serie) se crea sin serie", loose.r_event_created === true && loose.r_series_id === null && await num(`select count(*) n from events where id = '${loose.r_event_id}' and series_id is null`) === 1);

  verify("una fecha fuera de las fechas de la serie se rechaza (outside_series) y no deja nada a medias", await denied(() => upload(A, series, event("a9000000-0000-0000-0000-0000000000a4", { date: "2101-02-02" }))) && await num(`select count(*) n from events where app_event_id = 'a9000000-0000-0000-0000-0000000000a4'`) === 0);
  verify("el mismo uuid de la app en OTRO organizador es otro evento (no se pisan)", (await upload(B, null, event(APPEV, { slug: "app-b-abcd" })))[0].r_event_id !== first.r_event_id);
  verify("el borrador de la app NO es visible para el público", await num(`select count(*) n from events where id = '${first.r_event_id}' and status = 'borrador'`) === 1);

  // Rondas del evento (KIN-655)
  await as("authenticated", A, "update events set rounds = 3 where id = '" + first.r_event_id + "'", "el organizador SÍ cambia las rondas de su evento", "some");
  await as("authenticated", A, "update events set rounds = 11 where id = '" + first.r_event_id + "'", "rondas fuera de 1 a 10 se rechazan", "deny");
  await as("authenticated", A, "update events set rounds = 0 where id = '" + first.r_event_id + "'", "0 rondas se rechaza", "deny");
  await as("authenticated", B, "update events set rounds = 2 where id = '" + first.r_event_id + "'", "otro organizador NO cambia las rondas ajenas", "deny");
  await db.exec(`insert into event_results (id, event_id, participant_name, discipline, time_ms, penalty_ms, disqualified) values (gen_random_uuid(), '${first.r_event_id}', 'Sin lazador', 'lazo', 9000, 0, false)`);
  await as("authenticated", A, "update events set rounds = 6 where id = '" + first.r_event_id + "'", "con resultados NO se cambian las rondas", "deny");
  await as("authenticated", A, "update events set rounds = 3 where id = '" + first.r_event_id + "'", "guardar las mismas rondas (sin cambio) no estorba", "some");
  await as("authenticated", A, "select public.app_upload_event('" + A + "', null, '{}'::jsonb)", "un organizador NO llama la función desde el navegador", "deny");
  await as("anon", null, "select public.app_upload_event('" + A + "', null, '{}'::jsonb)", "anónimo NO llama la función", "deny");
  await as("authenticated", A, "update events set app_event_id = gen_random_uuid() where id = '" + first.r_event_id + "'", "nadie reescribe app_event_id desde el navegador", "deny");
}

// Historial de rating (KIN-627): cada cambio real del rating deja una fila; nadie escribe directo
{
  const n = async (sql) => Number((await db.query(sql)).rows[0].n);
  const R = "11111111-0000-0000-0000-000000000001", DISC = "prueba-historial";
  await db.exec(`insert into roper_ratings (roper_id, discipline, rating) values ('${R}','${DISC}', 5.0)`);
  check("un rating nuevo deja su primera fila de historial (sin valor anterior)", await n(`select count(*) n from roper_rating_history where roper_id = '${R}' and discipline = '${DISC}' and rating = 5.0 and previous_rating is null`) === 1);
  await db.exec(`update roper_ratings set rating = 6.5 where roper_id = '${R}' and discipline = '${DISC}'`);
  check("cambiar el rating deja otra fila con el valor anterior", await n(`select count(*) n from roper_rating_history where roper_id = '${R}' and discipline = '${DISC}' and rating = 6.5 and previous_rating = 5.0`) === 1);
  await db.exec(`update roper_ratings set events_count = 3, wins = 1 where roper_id = '${R}' and discipline = '${DISC}'`);
  check("si el valor no cambia (solo eventos o victorias) no se guarda nada", await n(`select count(*) n from roper_rating_history where roper_id = '${R}' and discipline = '${DISC}'`) === 2);
  await as("anon", null, `select * from public.public_roper_rating_history('${R}', 5)`, "anónimo SÍ ve la evolución del rating (es público)", "some");
  const latest = (await db.query(`select rating from public.public_roper_rating_history('${R}', 1)`)).rows[0];
  check("la función devuelve primero el cambio más reciente", Number(latest.rating) === 6.5);
  await as("anon", null, `insert into roper_rating_history (roper_id, discipline, rating) values ('${R}','${DISC}', 9)`, "anónimo NO escribe historial", "deny");
  await as("authenticated", A, `insert into roper_rating_history (roper_id, discipline, rating) values ('${R}','${DISC}', 9)`, "un organizador NO escribe historial", "deny");
  await as("authenticated", D, `delete from roper_rating_history`, "nadie borra historial escribiendo la tabla", "deny");
}

// Lista de espera de un evento lleno (KIN-726, 0049)
{
  console.log("— Lista de espera (0049)");
  const WEV = "e0000000-0000-0000-0000-0000000000b1", WEV2 = "e0000000-0000-0000-0000-0000000000b2", WCAT = "ca000000-0000-0000-0000-0000000000b1", WCAT2 = "ca000000-0000-0000-0000-0000000000b2";
  const WU = ["11111111-bbbb-0000-0000-0000000000b1", "11111111-bbbb-0000-0000-0000000000b2", "11111111-bbbb-0000-0000-0000000000b3"];
  const WR = ["33333333-0000-0000-0000-0000000000b1", "33333333-0000-0000-0000-0000000000b2", "33333333-0000-0000-0000-0000000000b3"];
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${WU[0]}','w1@x.com',now()), ('${WU[1]}','w2@x.com',now()), ('${WU[2]}','w3@x.com',now());
    insert into ropers (id, full_name, user_id) values ('${WR[0]}','Espera Uno','${WU[0]}'), ('${WR[1]}','Espera Dos','${WU[1]}'), ('${WR[2]}','Espera Tres','${WU[2]}');
    insert into events (id, name, organizer_id, status, slug, capacity) values ('${WEV}','Evento lleno','${A}','publicado','evento-lleno',1), ('${WEV2}','Evento con lugar','${A}','publicado','evento-con-lugar',5);
    insert into event_categories (id, event_id, name, fee_cents) values ('${WCAT}','${WEV}','Libre',50000), ('${WCAT2}','${WEV2}','Libre',50000);
  `);
  const rows = async (role, uid, sql) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role}`);
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const n = async (sql) => Number((await db.query(sql)).rows[0].n);
  const entryOf = async (roper) => (await db.query(`select id from event_waitlist where event_id = '${WEV}' and roper_id = '${roper}'`)).rows[0]?.id;

  await as("authenticated", WU[0], `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "con lugar libre NO entra a la lista de espera (se inscribe normal)", "deny");
  await as("authenticated", WU[0], `select public.register_for_event('${WEV}','${WCAT}')`, "el primero toma el único lugar", "some");
  await as("authenticated", WU[1], `select public.register_for_event('${WEV}','${WCAT}')`, "cupo lleno: inscribirse sigue rechazado", "deny");
  await as("authenticated", WU[1], `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "con el evento lleno SÍ entra a la lista de espera", "some");
  await as("authenticated", WU[1], `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "no entra dos veces a la misma lista", "deny");
  await as("authenticated", WU[2], `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "el segundo también espera", "some");
  await as("authenticated", WU[0], `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "quien ya está inscrito NO entra a la lista", "deny");
  await as("authenticated", WU[1], `select public.join_waitlist('${WEV2}','${WCAT2}',null,1)`, "evento con lugar: la lista de espera se rechaza", "deny");
  await as("authenticated", WU[1], `select public.join_waitlist('${WEV}','${WCAT2}',null,1)`, "categoría de otro evento se rechaza", "deny");
  await as("anon", null, `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "anónimo NO entra a la lista de espera", "deny");
  await as("authenticated", WU[1], `insert into event_waitlist (event_id, roper_id, category_id) values ('${WEV}','${WR[1]}','${WCAT}')`, "NO se escribe la tabla directo", "deny");
  check("una persona en espera NO cuenta en el cupo ni en las inscripciones", await n(`select count(*) n from registrations where event_id = '${WEV}'`) === 1);

  check("la persona ve solo su fila de espera", (await rows("authenticated", WU[1], "select id from event_waitlist")).length === 1);
  check("el organizador del evento ve toda la lista", (await rows("authenticated", A, `select id from event_waitlist where event_id = '${WEV}'`)).length === 2);
  check("otro organizador NO ve la lista", (await rows("authenticated", B, `select id from event_waitlist where event_id = '${WEV}'`)).length === 0);
  check("anónimo NO ve la lista", (await rows("anon", null, "select 1 from event_waitlist").catch(() => [])).length === 0);
  const mine = await rows("authenticated", WU[2], "select place from public.my_waitlist()");
  check("my_waitlist da el lugar en la fila (el segundo es el 2)", mine.length === 1 && Number(mine[0].place) === 2);
  check("event_waitlist_counts da cuántos esperan (solo el número)", Number((await rows("anon", null, `select n from public.event_waitlist_counts() where event_id = '${WEV}'`))[0]?.n) === 2);

  const e2 = await entryOf(WR[1]), e3 = await entryOf(WR[2]);
  await as("authenticated", WU[1], `select public.promote_waitlist_entry('${e2}')`, "un participante NO pasa a nadie a inscrito", "deny");
  await as("authenticated", B, `select public.promote_waitlist_entry('${e2}')`, "otro organizador NO pasa a nadie a inscrito", "deny");
  await as("authenticated", A, `select public.promote_waitlist_entry('${e2}')`, "con el evento lleno NO se puede pasar a nadie", "deny");
  await as("authenticated", WU[1], `select public.remove_waitlist_entry('${e3}')`, "un participante NO quita a otro de la lista", "deny");
  await as("authenticated", WU[1], `select public.leave_waitlist('${e3}')`, "nadie sale de la lista por otra persona", "deny");

  // Se abre un lugar: la persona cancela su inscripción (pendiente) y el organizador mueve al siguiente.
  const before = await n("select count(*) n from notifications where kind = 'promoted'");
  const upd0 = (await db.query(`select updated_at from events where id = '${WEV}'`)).rows[0].updated_at;
  await as("authenticated", WU[0], `select public.cancel_registration((select id from registrations where event_id = '${WEV}' and roper_id = '${WR[0]}'))`, "el inscrito cancela y libera su lugar", "some");
  const upd1 = (await db.query(`select updated_at from events where id = '${WEV}'`)).rows[0].updated_at;
  check("cambiar inscripciones o la lista mueve events.updated_at (sync con la app)", new Date(upd1) > new Date(upd0));
  await as("authenticated", A, `select public.promote_waitlist_entry('${e2}')`, "con lugar libre el organizador SÍ pasa al siguiente a inscrito", "some");
  check("queda inscrito y pendiente de pago, con el monto de la categoría", await n(`select count(*) n from registrations where event_id = '${WEV}' and roper_id = '${WR[1]}' and payment_status = 'pendiente' and amount_cents = 50000`) === 1);
  check("sale de la lista de espera al pasar a inscrito", await n(`select count(*) n from event_waitlist where id = '${e2}'`) === 0);
  check("la persona recibe un aviso dentro de la web", await n("select count(*) n from notifications where kind = 'promoted'") === before + 1);
  await as("authenticated", A, `select public.promote_waitlist_entry('${e3}')`, "el cupo vuelve a estar lleno: no pasa al siguiente", "deny");

  // Quitar y salir
  await as("authenticated", A, `select public.remove_waitlist_entry('${e3}')`, "el organizador quita a alguien de la lista", "some");
  check("quitado de la lista", await n(`select count(*) n from event_waitlist where id = '${e3}'`) === 0);
  await as("authenticated", WU[2], `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "puede volver a entrar a la lista", "some");
  const back = await entryOf(WR[2]);
  await as("authenticated", WU[2], `select public.leave_waitlist('${back}')`, "la persona sale de la lista por su cuenta", "some");
  check("ya no está en la lista", await n(`select count(*) n from event_waitlist where id = '${back}'`) === 0);

  // Si se inscribe por otra vía, su fila de espera desaparece sola
  await as("authenticated", WU[2], `select public.join_waitlist('${WEV}','${WCAT}',null,1)`, "vuelve a la lista (para probar la limpieza)", "some");
  await db.exec(`update events set capacity = 3 where id = '${WEV}'; insert into registrations (event_id, roper_id, category_id, amount_cents) values ('${WEV}','${WR[2]}','${WCAT}',50000)`);
  check("inscribirse por cualquier vía borra su fila de espera", await n(`select count(*) n from event_waitlist where event_id = '${WEV}' and roper_id = '${WR[2]}'`) === 0);
  await db.exec(`insert into event_waitlist (event_id, roper_id, category_id) values ('${WEV}','${WR[0]}','${WCAT}')`);
  const asked = (await db.query(`select global_id from public.app_event_participants('${WEV}', null, now() + interval '1 day', null, null, 50)`)).rows.map((r) => r.global_id);
  // La app mete a su roster a TODO el que devuelve esta API: quien solo espera lugar no debe venir (va aparte, en waitlist[] de eventos).
  check("la API de participantes de la app NO trae a quien solo está en lista de espera", !asked.includes(WR[0]));
  check("la API de participantes de la app sí trae a quien ya está inscrito", asked.includes(WR[1]));
  await db.exec(`delete from events where id in ('${WEV}','${WEV2}')`);
  check("borrar el evento borra su lista de espera", await n(`select count(*) n from event_waitlist where event_id in ('${WEV}','${WEV2}')`) === 0);
}


// ID corto del lazador (0051, KIN-752)
{
  console.log("— ID corto del lazador (0051)");
  const rows = async (sql) => (await db.query(sql)).rows;
  const one = async (sql) => (await db.query(sql)).rows[0];
  const check = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label.padEnd(58)} → ${ok ? "ok" : "NO"}`); };

  // Los perfiles que ya existían (aquí, los de los datos de prueba de arriba) y los nuevos tienen número, único y con formato.
  check("todo perfil tiene número único", (await one("select count(*)::int a, count(distinct rm_number)::int b from ropers")).a === (await one("select count(distinct rm_number)::int b from ropers")).b);
  check("el texto es RM- con al menos 4 dígitos", (await one("select count(*)::int n from ropers where short_id !~ '^RM-[0-9]{4,}$'")).n === 0);

  // Los nuevos reciben el siguiente número solos, sin reutilizar el de uno borrado.
  const first = (await one("insert into ropers (full_name) values ('[RM] Uno') returning rm_number, id")).rm_number;
  const second = await one("insert into ropers (full_name) values ('[RM] Dos') returning rm_number, id");
  check("el siguiente perfil recibe el número siguiente", Number(second.rm_number) === Number(first) + 1);
  await db.exec(`delete from ropers where id = '${second.id}'`);
  const third = await one("insert into ropers (full_name) values ('[RM] Tres') returning rm_number, short_id, id");
  check("un número borrado NO se reutiliza", Number(third.rm_number) === Number(second.rm_number) + 1);
  check("el texto sale con ceros a la izquierda", third.short_id === "RM-" + String(third.rm_number).padStart(4, "0"));

  // Una vez puesto, no cambia (ni con la llave de servicio).
  let changed = true;
  try { await db.exec(`update ropers set rm_number = 99999 where id = '${third.id}'`); } catch { changed = false; }
  check("el número no se puede cambiar", !changed && Number((await one(`select rm_number from ropers where id = '${third.id}'`)).rm_number) === Number(third.rm_number));

  // Permisos: se lee público y nadie lo escribe desde la API.
  await as("anon", null, "select short_id from ropers limit 1", "anónimo SÍ ve el ID corto", "some");
  await as("authenticated", C, "select rm_number, short_id from ropers limit 1", "autenticado SÍ ve el ID corto", "some");
  await as("authenticated", C, `update ropers set rm_number = 5 where id = '${third.id}'`, "autenticado NO cambia el número", "deny");
  await as("authenticated", C, `update ropers set short_id = 'RM-0005' where id = '${third.id}'`, "autenticado NO escribe el texto", "deny");
  await as("anon", null, `update ropers set rm_number = 5 where id = '${third.id}'`, "anónimo NO cambia el número", "deny");

  // El formato crece sin cambiar: ... RM-9999, RM-10000, RM-10001.
  await db.exec("select setval('public.ropers_rm_number_seq', 9998, true)");
  const a = await one("insert into ropers (full_name) values ('[RM] Casi') returning short_id");
  const b = await one("insert into ropers (full_name) values ('[RM] Cinco') returning short_id");
  const c = await one("insert into ropers (full_name) values ('[RM] Seis') returning short_id");
  check("pasado el 9999 el ID sigue como RM-10000", a.short_id === "RM-9999" && b.short_id === "RM-10000" && c.short_id === "RM-10001");

  // Búsqueda pública por ID.
  const target = await one("select id, rm_number, short_id from ropers where full_name = '[RM] Cinco'");
  const search = (token) => `select roper_id, full_name from public.public_ranking('lazo', 1, array['${token}'], null, 10)`;
  await as("anon", null, search(target.short_id.toLowerCase()), "anónimo busca por ID (rm-10000)", "some");
  check("la búsqueda por ID devuelve a esa persona y a nadie más", JSON.stringify((await rows(search(target.short_id.toLowerCase()))).map((r) => r.full_name)) === '["[RM] Cinco"]');
  check("también sin guion (rm10000)", (await rows(search("rm10000"))).length === 1);
  check("un ID que no existe no devuelve a nadie", (await rows(search("rm-99999999"))).length === 0);
  check("un ID que nunca se asignó no devuelve a nadie", (await rows(search("rm-0000"))).length === 0);
  check("buscar por nombre sigue funcionando", (await rows("select full_name from public.public_ranking('lazo', 1, array['cinc'], null, 10)")).some((r) => r.full_name === "[RM] Cinco"));
  check("ID mezclado con nombre busca por nombre (sin resultados)", (await rows("select full_name from public.public_ranking('lazo', 1, array['rm-10000','cinco'], null, 10)")).length === 0);
  check("dígitos sueltos NO se toman por un ID", (await rows("select full_name from public.public_ranking('lazo', 1, array['10000'], null, 10)")).length === 0);
  check("un número enorme no rompe la búsqueda", (await rows(search("rm-" + "9".repeat(30)))).length === 0);
  // Un perfil fusionado no sale al buscar por su ID (el ranking solo lista perfiles vigentes).
  await db.exec(`update ropers set merged_into = '${target.id}' where full_name = '[RM] Seis'`);
  check("un perfil fusionado no aparece por su ID", (await rows(search("rm-10001"))).length === 0);

  // Relleno de los perfiles que ya existían, en una base aparte con todo hasta la 0050 y la 0051 aplicada después.
  const old = new PGlite();
  await old.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    grant usage on schema public, auth, storage to anon, authenticated;
    grant usage on schema public to service_role;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  const files = readdirSync(dir).sort();
  for (const f of files.filter((x) => x < "0051")) await old.exec(readFileSync(`${dir}/${f}`, "utf8"));
  await old.exec(`
    insert into ropers (id, full_name, created_at) values
      ('00000000-0000-0000-0000-00000000000c', 'Carla (la tercera)', '2026-03-01'),
      ('00000000-0000-0000-0000-00000000000a', 'Ana (la primera)',   '2026-01-01'),
      ('00000000-0000-0000-0000-00000000000b', 'Beto (el segundo)',  '2026-02-01'),
      ('00000000-0000-0000-0000-00000000000d', 'Dani (mismo día)',   '2026-03-01');
  `);
  for (const f of files.filter((x) => x >= "0051")) await old.exec(readFileSync(`${dir}/${f}`, "utf8"));
  const order = (await old.query("select full_name, short_id from ropers order by rm_number")).rows.map((r) => `${r.short_id} ${r.full_name.split(" ")[0]}`);
  check("los existentes se numeran en orden de creación (y por id si empatan)", JSON.stringify(order) === '["RM-0001 Ana","RM-0002 Beto","RM-0003 Carla","RM-0004 Dani"]');
  const next = (await old.query("insert into ropers (full_name) values ('Nuevo') returning short_id")).rows[0].short_id;
  check("el primer perfil nuevo continúa la numeración", next === "RM-0005");
  await old.close();
}

// Evento individual (KIN-750): el organizador crea un evento sin serie, con lo mismo que pide cada evento de una serie.
{
  console.log("\n— Evento individual (sin serie)");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const EVI = "e7500000-0000-0000-0000-0000000000a1", EVJ = "e7500000-0000-0000-0000-0000000000a2";
  await db.exec(`update profiles set license_valid_until = 'infinity' where user_id = '${A}'`);
  await as("authenticated", A, `insert into events (id, slug, name, event_date, city, venue, capacity, disciplines, status, organizer_id, organizer_name, draw_type, lazada_shots_per_package, max_team_rating, rounds, timezone, registration_opens_at, registration_closes_at, description)
    values ('${EVI}', 'individual-7501', 'Individual', '2099-11-01', 'Zacatecas', 'Lienzo', 50, '{lazo}', 'publicado', '${A}', 'Org A', 'lazada_sorteada', 3, 12.5, 4, 'America/Mexico_City', '2099-10-01T10:00:00Z', '2099-10-31T10:00:00Z', 'Sin serie')`, "el organizador SÍ crea un evento individual con sorteo, rondas y cierre", "some");
  await as("authenticated", A, `insert into event_categories (event_id, name, fee_cents) values ('${EVI}', 'Libre', 80000), ('${EVI}', 'Amateur', 50000)`, "y le agrega sus categorías", "some");
  await as("authenticated", A, `insert into event_payment_info (event_id, instructions) values ('${EVI}', 'CLABE 1234')`, "y sus instrucciones de pago", "some");
  verify("el evento individual queda sin serie, con sus datos y categorías", await num(`select count(*) n from events e where e.id = '${EVI}' and e.series_id is null and e.draw_type = 'lazada_sorteada' and e.lazada_shots_per_package = 3 and e.rounds = 4 and (select count(*) from event_categories where event_id = e.id) = 2`) === 1);
  await as("anon", null, "select id from events where slug = 'individual-7501'", "un evento individual publicado es público", "some");
  await as("authenticated", A, `insert into events (id, slug, name, event_date, city, venue, capacity, disciplines, status, organizer_id, organizer_name, draw_type, lazada_shots_per_package) values ('${EVJ}', 'individual-7502', 'Cero tiros', '2099-11-02', 'Zacatecas', 'Lienzo', 50, '{lazo}', 'borrador', '${A}', 'Org A', 'lazada_sorteada', 0)`, "tiros por paquete menores a 1 se rechazan al crear", "deny");
  await as("authenticated", C, `insert into events (id, slug, name, organizer_id, status) values (gen_random_uuid(), 'individual-7503', 'De participante', '${C}', 'borrador')`, "un participante NO crea eventos individuales", "deny");
  await as("authenticated", A, `insert into events (id, slug, name, organizer_id, status) values (gen_random_uuid(), 'individual-7504', 'A nombre de otro', '${B}', 'borrador')`, "NO crea un evento individual a nombre de otro organizador", "deny");
  await as("authenticated", B, `insert into event_categories (event_id, name, fee_cents) values ('${EVI}', 'Colada', 1)`, "otro organizador NO agrega categorías al evento individual", "deny");
  await as("authenticated", A, `select public.delete_series_event('${EVI}')`, "el borrado de eventos de serie NO aplica a uno individual (no_in_series)", "deny");
}

// Pantalla general de pagos (KIN-754): lo que lee y cambia usa permisos que ya existen; se comprueba que cada organizador solo ve y marca lo suyo.
{
  console.log("\n— Pagos del organizador (pantalla general)");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const mine = `select r.id from registrations r join events e on e.id = r.event_id where e.organizer_id = '${A}' and r.payment_status = 'pendiente' order by r.id limit 1`;
  verify("hay una inscripción pendiente de A para probar", await num(`select count(*) n from (${mine}) x`) === 1);
  await as("authenticated", A, "select r.id, r.created_at, r.paid_at, r.payment_status, r.payment_method, r.amount_cents, r.role from registrations r where r.payment_status in ('pendiente','pagado')", "el organizador lee los pagos de sus eventos", "some");
  await as("authenticated", B, `select id from registrations where event_id in (select id from events where organizer_id = '${A}') and roper_id <> (select public.my_roper_id())`, "otro organizador NO lee los pagos de inscritos ajenos de ese organizador", "deny");
  await as("anon", null, "select id from registrations", "anónimo NO lee pagos", "deny");
  await as("authenticated", B, `select public.set_registration_payment((${mine}), 'efectivo')`, "otro organizador NO marca un pago ajeno", "deny");
  await as("authenticated", A, `select public.set_registration_payment((${mine}), 'efectivo')`, "el organizador SÍ marca un pago de su evento", "some");
  verify("el pago queda pagado, con fecha y método", await num(`select count(*) n from registrations r join events e on e.id = r.event_id where e.organizer_id = '${A}' and r.payment_status = 'pagado' and r.payment_method = 'efectivo' and r.paid_at is not null`) >= 1);
  await as("authenticated", A, `select public.set_registration_payment((select r.id from registrations r join events e on e.id = r.event_id where e.organizer_id = '${A}' and r.payment_method = 'efectivo' order by r.id limit 1), null)`, "y lo puede regresar a pendiente", "some");
}

// Arenas como catálogo (KIN-751): cada organizador solo ve y cambia las suyas; los eventos se enlazan solos; renombrar y unir no pierden eventos.
{
  console.log("\n— Arenas del organizador");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const AR1 = "a7510000-0000-0000-0000-000000000001", AR2 = "a7510000-0000-0000-0000-000000000002", ARB = "a7510000-0000-0000-0000-0000000000b1";
  const E1 = "e7510000-0000-0000-0000-000000000001", E2 = "e7510000-0000-0000-0000-000000000002", E3 = "e7510000-0000-0000-0000-000000000003", E4 = "e7510000-0000-0000-0000-000000000004";
  const SER = "5e510000-0000-0000-0000-000000000001";
  await db.exec(`update profiles set license_valid_until = 'infinity' where user_id = '${A}'`);

  // La llave de la base es la misma que calcula la web (src/lib/arena.ts)
  for (const [txt, key] of [["Arena X", "arena x"], ["  ARENA   x. ", "arena x"], ["Árbol Ñandú, S.A.", "arbol nandu s a"], ["Lienzo Charro «Los Encinos»", "lienzo charro los encinos"], [" ... ", ""]]) {
    verify(`la llave de «${txt.trim()}» es «${key}»`, (await db.query(`select private.arena_key($1) k`, [txt])).rows[0].k === key);
  }

  // Catálogo: permisos y llave
  await as("authenticated", A, `insert into arenas (id, organizer_id, name, city, notes) values ('${AR1}', '${A}', '  Lienzo   Charro ', 'Zacatecas', 'Av. Principal')`, "el organizador SÍ agrega una arena", "some");
  verify("el nombre se limpia y la llave ignora mayúsculas, acentos y signos", await num(`select count(*) n from arenas where id = '${AR1}' and name = 'Lienzo Charro' and key = 'lienzo charro'`) === 1);
  await as("authenticated", A, `insert into arenas (organizer_id, name) values ('${A}', 'LIENZO  charro.')`, "otra escritura de la misma arena se rechaza (duplicada)", "deny");
  await as("authenticated", A, `insert into arenas (organizer_id, name) values ('${A}', '  ... ')`, "un nombre sin letras ni números se rechaza", "deny");
  await as("authenticated", A, `insert into arenas (organizer_id, name) values ('${B}', 'A nombre de B')`, "NO crea arenas a nombre de otro organizador", "deny");
  await as("authenticated", A, `select id from arenas`, "el organizador ve sus arenas", "some");
  await as("authenticated", B, `select id from arenas where organizer_id = '${A}'`, "otro organizador NO ve sus arenas", "deny");
  await as("authenticated", C, `select id from arenas`, "un participante NO ve arenas", "deny");
  await as("anon", null, `select id from arenas`, "anónimo NO ve arenas", "deny");
  await as("authenticated", B, `update arenas set name = 'Robada' where id = '${AR1}'`, "otro organizador NO edita la arena", "deny");
  await as("authenticated", A, `update arenas set key = 'otra' where id = '${AR1}'`, "la llave no se escribe a mano", "deny");

  // Enlace automático: un evento con solo el texto del lugar queda enlazado, sin cambiar su texto
  await as("authenticated", A, `insert into events (id, name, organizer_id, status, slug, venue, city) values ('${E1}', 'Con texto', '${A}', 'publicado', 'arena-e1', 'LIENZO charro', 'Otra ciudad')`, "un evento con el lugar escrito se crea", "some");
  verify("queda enlazado a la arena que ya existía y su texto no cambia", await num(`select count(*) n from events where id = '${E1}' and arena_id = '${AR1}' and venue = 'LIENZO charro' and city = 'Otra ciudad'`) === 1);
  await as("authenticated", A, `insert into events (id, name, organizer_id, status, slug, venue, city) values ('${E2}', 'Arena nueva', '${A}', 'publicado', 'arena-e2', 'Arena del Sur', 'Monterrey')`, "un lugar que no existe se crea al vuelo", "some");
  verify("se creó la arena del organizador con su ciudad", await num(`select count(*) n from arenas where organizer_id = '${A}' and key = 'arena del sur' and city = 'Monterrey'`) === 1);
  verify("y el evento quedó enlazado a ella", await num(`select count(*) n from events e join arenas a on a.id = e.arena_id where e.id = '${E2}' and a.key = 'arena del sur'`) === 1);
  await as("authenticated", A, `insert into events (id, name, organizer_id, status, slug, venue, city) values ('${E3}', 'Sin lugar', '${A}', 'borrador', 'arena-e3', '', '')`, "un evento sin lugar se crea sin arena", "some");
  verify("y queda sin arena", await num(`select count(*) n from events where id = '${E3}' and arena_id is null`) === 1);

  // Elegir una arena explícita
  await db.exec(`insert into arenas (id, organizer_id, name, city) values ('${ARB}', '${B}', 'Arena de B', 'Puebla')`);
  await as("authenticated", A, `insert into events (id, name, organizer_id, status, slug, venue, city, arena_id) values ('${E4}', 'Con arena de B', '${A}', 'borrador', 'arena-e4', 'x', 'y', '${ARB}')`, "NO crea un evento con la arena de otro organizador", "deny");
  await as("authenticated", A, `update events set arena_id = '${ARB}' where id = '${E1}'`, "NO cambia un evento a la arena de otro organizador", "deny");
  await as("authenticated", A, `update events set arena_id = (select id from arenas where key = 'arena del sur' and organizer_id = '${A}') where id = '${E3}'`, "SÍ elige una arena propia para un evento", "some");
  verify("el evento toma el nombre y la ciudad de la arena elegida", await num(`select count(*) n from events where id = '${E3}' and venue = 'Arena del Sur' and city = 'Monterrey'`) === 1);
  await as("authenticated", A, `update events set venue = 'Rancho Nuevo' where id = '${E3}'`, "cambiar solo el texto del lugar", "some");
  verify("lo enlaza (o crea) la arena de ese nombre", await num(`select count(*) n from events e join arenas a on a.id = e.arena_id where e.id = '${E3}' and a.key = 'rancho nuevo'`) === 1);

  // Plantilla de serie
  await db.exec(`insert into event_series (id, slug, organizer_id, name, start_date, end_date) values ('${SER}', 'serie-arenas-7510', '${A}', 'Serie arenas', '2099-01-01', '2099-12-31')`);
  await as("authenticated", A, `insert into event_series_template (series_id, city, venue) values ('${SER}', '', 'Lienzo Charro')`, "la plantilla de una serie se crea con su lugar", "some");
  verify("la plantilla queda enlazada a la misma arena", await num(`select count(*) n from event_series_template where series_id = '${SER}' and arena_id = '${AR1}'`) === 1);

  // Renombrar se refleja en sus eventos que no han terminado
  await db.exec(`update events set status = 'finalizado' where id = '${E2}'`);
  await db.exec(`update events set arena_id = (select id from arenas where key = 'arena del sur' and organizer_id = '${A}') where id = '${E2}'`);
  await db.exec(`insert into events (id, name, organizer_id, status, slug, venue, city) values ('e7510000-0000-0000-0000-000000000005', 'Sin terminar', '${A}', 'publicado', 'arena-e5', 'Arena del Sur', 'Monterrey')`);
  await as("authenticated", A, `update arenas set name = 'Arena del Sur Grande', city = 'San Pedro' where key = 'arena del sur' and organizer_id = '${A}'`, "el organizador renombra su arena", "some");
  verify("su evento sin terminar toma el nombre y la ciudad nuevos", await num(`select count(*) n from events where id = 'e7510000-0000-0000-0000-000000000005' and venue = 'Arena del Sur Grande' and city = 'San Pedro'`) === 1);
  verify("(el evento finalizado conserva lo que tenía)", await num(`select count(*) n from events where id = '${E2}' and venue = 'Arena del Sur'`) === 1);

  // Unir
  await as("authenticated", B, `select public.merge_arenas('${ARB}', '${AR1}')`, "otro organizador NO une arenas ajenas", "deny");
  await as("authenticated", A, `select public.merge_arenas('${AR1}', '${AR1}')`, "no se une una arena consigo misma", "deny");
  await as("authenticated", A, `select public.merge_arenas('${AR1}', '${ARB}')`, "NO une con una arena de otro organizador", "deny");
  const before = await num(`select count(*) n from events where organizer_id = '${A}'`);
  await db.exec(`insert into arenas (id, organizer_id, name, city) values ('${AR2}', '${A}', 'Lienzo Charro Zacatecas', '')`);
  await db.exec(`update events set arena_id = '${AR2}' where id = '${E1}'`);
  await as("authenticated", A, `select public.merge_arenas('${AR1}', '${AR2}')`, "el organizador SÍ une dos arenas suyas", "some");
  verify("la arena repetida se borró", await num(`select count(*) n from arenas where id = '${AR2}'`) === 0);
  verify("sus eventos pasaron a la arena que se quedó, con su nombre", await num(`select count(*) n from events where id = '${E1}' and arena_id = '${AR1}' and venue = 'Lienzo Charro'`) === 1);
  verify("no se perdió ningún evento", await num(`select count(*) n from events where organizer_id = '${A}'`) === before);

  // Borrar
  await as("authenticated", A, `delete from arenas where id = '${AR1}'`, "una arena con eventos NO se borra", "deny");
  await db.exec(`insert into arenas (id, organizer_id, name) values ('a7510000-0000-0000-0000-0000000000c1', '${A}', 'Sin uso')`);
  await as("authenticated", B, `delete from arenas where id = 'a7510000-0000-0000-0000-0000000000c1'`, "otro organizador NO borra la arena", "deny");
  await as("authenticated", A, `delete from arenas where id = 'a7510000-0000-0000-0000-0000000000c1'`, "una arena sin uso SÍ se borra", "some");
}

// Resumen del organizador por arena (KIN-762, migración 0054): el panel filtra por la llave de la arena y solo ve lo de sus propias arenas.
{
  console.log("\n— Resumen del organizador por arena");
  const num = async (sql) => Number((await db.query(sql)).rows[0].n);
  const verify = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const NORTE = "Arena Norte KIN762", SUR = "Arena Sur KIN762", KNORTE = "arena norte kin762", KSUR = "arena sur kin762";
  const SER762 = "5e762000-0000-0000-0000-000000000001";
  const EN1 = "e7620000-0000-0000-0000-000000000001", EN2 = "e7620000-0000-0000-0000-000000000002", ES1 = "e7620000-0000-0000-0000-000000000003", EB1 = "e7620000-0000-0000-0000-0000000000b1";
  const ANA = "11111111-0000-0000-0000-000000000001", MATEO = "22222222-0000-0000-0000-000000000002";
  const overview = async (who, arg) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role authenticated`);
    try { return (arg === undefined ? await db.query("select public.organizer_overview() as o") : await db.query("select public.organizer_overview($1) as o", [arg])).rows[0].o; }
    finally { await db.exec("reset role"); }
  };
  await db.exec(`update profiles set license_valid_until = 'infinity' where user_id in ('${A}', '${B}')`);
  // El organizador A crea eventos en dos arenas (se enlazan solos por el lugar); B tiene su propia arena con otro nombre y un evento.
  await db.exec(`
    insert into event_series (id, slug, organizer_id, name, start_date, end_date) values ('${SER762}', 'serie-762', '${A}', 'Serie 762', '2099-01-01', '2099-12-31');
    insert into events (id, name, organizer_id, status, slug, event_date, venue, city, series_id) values
      ('${EN1}', 'Norte uno', '${A}', 'publicado', 'norte-uno-762', '2099-06-01', '${NORTE}', 'Monterrey', '${SER762}'),
      ('${EN2}', 'Norte borrador', '${A}', 'borrador', 'norte-borrador-762', '2099-06-02', 'ARENA  norte kin762.', 'Monterrey', null),
      ('${ES1}', 'Sur uno', '${A}', 'publicado', 'sur-uno-762', '2099-07-01', '${SUR}', 'Saltillo', null),
      ('${EB1}', 'Evento de B', '${B}', 'publicado', 'b-uno-762', '2099-08-01', 'Arena de B 762', 'Puebla', null);
    insert into registrations (event_id, roper_id, amount_cents, payment_status, payment_method) values
      ('${EN1}', '${ANA}', 50000, 'pagado', 'efectivo'), ('${EN1}', '${MATEO}', 30000, 'pendiente', null),
      ('${ES1}', '${ANA}', 10000, 'pendiente', null), ('${EB1}', '${ANA}', 99000, 'pagado', 'efectivo');
  `);
  verify("cada evento quedó con su arena correcta (los dos de Norte en la misma, el de Sur en otra)", await num(`select count(*) n from events e join arenas a on a.id = e.arena_id where e.organizer_id = '${A}' and ((e.id in ('${EN1}', '${EN2}') and a.key = '${KNORTE}') or (e.id = '${ES1}' and a.key = '${KSUR}'))`) === 3);
  verify("las dos arenas de A son distintas y solo de A", await num(`select count(distinct id) n from arenas where organizer_id = '${A}' and key in ('${KNORTE}', '${KSUR}')`) === 2 && await num(`select count(*) n from arenas where organizer_id = '${B}' and key in ('${KNORTE}', '${KSUR}')`) === 0);
  await as("authenticated", B, `select id from arenas where key in ('${KNORTE}', '${KSUR}')`, "otro organizador NO ve esas arenas", "deny");
  await as("authenticated", B, `update events set venue = 'Robado' where id = '${EN1}'`, "otro organizador NO edita sus eventos", "deny");

  // Permisos de la función, con y sin filtro
  await as("anon", null, `select public.organizer_overview('${KNORTE}')`, "anónimo NO pide el resumen por arena", "deny");
  await as("authenticated", C, `select public.organizer_overview('${KNORTE}')`, "un participante NO pide el resumen por arena", "deny");
  await as("authenticated", A, `select public.organizer_overview('${KNORTE}')`, "el organizador SÍ pide el resumen de su arena", "some");
  await as("authenticated", A, `select public.organizer_overview()`, "y sin filtro sigue funcionando igual que antes", "some");

  // Con filtro, todo el resumen sale solo de esa arena
  const norte = await overview(A, KNORTE), sur = await overview(A, KSUR);
  verify("el resumen dice de qué arena es (id, nombre, ciudad y llave)", norte.arena?.key === KNORTE && norte.arena?.name === NORTE && norte.arena?.city === "Monterrey" && typeof norte.arena?.id === "string");
  const pagos = (o, pending, paid, pendingCents, collectedCents) => o.payments.pending === pending && o.payments.paid === paid && o.payments.pending_cents === pendingCents && o.payments.collected_cents === collectedCents;
  verify("Norte: pagos solo de sus eventos (1 pagado, 1 pendiente)", pagos(norte, 1, 1, 30000, 50000));
  verify("Norte: estados (1 abierto, 1 borrador) y su próximo evento", norte.states.open === 1 && norte.states.draft === 1 && norte.states.finished === 0 && norte.next_event?.slug === "norte-uno-762" && norte.next_event?.enrolled === 2);
  verify("Norte: la actividad y los pendientes son solo de Norte", norte.activity.length === 2 && norte.activity.every((x) => x.event === "Norte uno") && norte.todo.unpaid.length === 1 && norte.todo.unpaid[0].slug === "norte-uno-762");
  verify("Norte: la próxima serie es la que tiene eventos ahí", norte.series?.slug === "serie-762" && norte.series?.events === 1 && norte.series?.enrolled === 2);
  verify("Sur: pagos solo de su evento (1 pendiente)", sur.arena?.key === KSUR && pagos(sur, 1, 0, 10000, 0));
  verify("Sur: su próximo evento y sin serie (ninguna serie tiene eventos ahí)", sur.next_event?.slug === "sur-uno-762" && sur.states.open === 1 && sur.states.draft === 0 && sur.series === null);
  verify("ningún resumen filtrado incluye el evento de otra arena ni de otro organizador", !JSON.stringify(norte).includes("Sur uno") && !JSON.stringify(sur).includes("Norte") && !JSON.stringify([norte, sur]).includes("Evento de B"));

  // La llave se entiende escrita de cualquier forma, como en la web
  const escrita = await overview(A, "  ARENA   Norte  KIN762. ");
  verify("«  ARENA   Norte  KIN762. » es la misma arena que su llave", escrita.arena?.id === norte.arena.id && pagos(escrita, 1, 1, 30000, 50000));

  // Sin filtro, o con una llave vacía o sin letras, es lo de siempre (no filtra)
  const todo = await overview(A), sinArgumento = await overview(A, null), vacio = await overview(A, ""), signos = await overview(A, " ... ");
  verify("sin filtro: la respuesta trae arena null y las secciones de siempre", todo.arena === null && ["series", "next_event", "payments", "states", "activity", "todo"].every((k) => k in todo));
  verify("null, vacío o solo signos NO filtran (igual que sin argumento)", [sinArgumento, vacio, signos].every((o) => JSON.stringify(o) === JSON.stringify(todo)));
  verify("sin filtro cuenta los eventos de todas sus arenas (Norte + Sur de más)", todo.payments.pending >= norte.payments.pending + sur.payments.pending && todo.payments.paid >= norte.payments.paid + sur.payments.paid && todo.states.open >= norte.states.open + sur.states.open);

  // Una llave que no es suya, que no existe o que se renombró no revela nada: resumen vacío y arena null
  const ajena = await overview(B, KNORTE), inexistente = await overview(A, "no existe esta arena 762");
  const vacioEsperado = (o) => o.arena === null && o.series === null && o.next_event === null && o.payments.pending === 0 && o.payments.paid === 0 && o.states.open + o.states.scheduled + o.states.finished + o.states.draft === 0 && o.activity.length === 0 && o.todo.unpaid.length === 0;
  verify("B pidiendo la llave de una arena de A recibe el resumen vacío (sin error ni datos de A)", vacioEsperado(ajena) && !JSON.stringify(ajena).includes("Norte"));
  verify("una llave que no existe da el resumen vacío", vacioEsperado(inexistente));
  const deB = await overview(B, "arena de b 762");
  verify("B filtrando por su propia arena ve solo lo suyo", deB.arena?.name === "Arena de B 762" && deB.payments.collected_cents === 99000 && !JSON.stringify(deB).includes("Norte"));
  // Consultar el resumen es solo lectura: el lugar escrito y la arena de cada evento siguen exactamente igual
  verify("consultar el resumen no cambia ningún evento ni arena", await num(`select count(*) n from events where (id = '${EN1}' and venue = '${NORTE}') or (id = '${EN2}' and venue = 'ARENA  norte kin762.') or (id = '${ES1}' and venue = '${SUR}')`) === 3);

  // Al renombrar la arena cambia su llave: la vieja ya no coincide y la nueva sí
  await db.exec(`update arenas set name = 'Arena Norte Renombrada KIN762' where organizer_id = '${A}' and key = '${KNORTE}'`);
  verify("si la arena se renombra, la llave vieja ya no coincide y la nueva sí", vacioEsperado(await overview(A, KNORTE)) && (await overview(A, "arena norte renombrada kin762")).payments.paid === 1);
}

// Relleno de la 0052: las arenas salen de los lugares que ya existían, sin cambiar el texto de los eventos ni su fecha de actualización.
{
  console.log("\n— Arenas: relleno de los eventos existentes");
  const check = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label}`); };
  const old = new PGlite();
  await old.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    grant usage on schema public, auth, storage to anon, authenticated;
    grant usage on schema public to service_role;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  const files = readdirSync(dir).sort();
  for (const f of files.filter((x) => x < "0052")) await old.exec(readFileSync(`${dir}/${f}`, "utf8"));
  const O1 = "0a000000-0000-0000-0000-000000000001", O2 = "0a000000-0000-0000-0000-000000000002";
  await old.exec(`
    insert into auth.users (id, email) values ('${O1}', 'o1@x.com'), ('${O2}', 'o2@x.com');
    insert into events (id, name, organizer_id, status, slug, venue, city, updated_at) values
      ('0e000000-0000-0000-0000-000000000001', 'E1', '${O1}', 'publicado', 'rel-1', 'Arena Norte', 'Monterrey', '2026-01-01'),
      ('0e000000-0000-0000-0000-000000000002', 'E2', '${O1}', 'publicado', 'rel-2', 'arena  norte.', '', '2026-01-02'),
      ('0e000000-0000-0000-0000-000000000003', 'E3', '${O1}', 'publicado', 'rel-3', 'Arena Norte', 'Monterrey', '2026-01-03'),
      ('0e000000-0000-0000-0000-000000000004', 'E4', '${O1}', 'borrador', 'rel-4', 'Lienzo Sur', 'Puebla', '2026-01-04'),
      ('0e000000-0000-0000-0000-000000000005', 'E5', '${O1}', 'borrador', 'rel-5', '', '', '2026-01-05'),
      ('0e000000-0000-0000-0000-000000000006', 'E6', '${O2}', 'publicado', 'rel-6', 'Arena Norte', 'Saltillo', '2026-01-06');
    insert into event_series (id, slug, organizer_id, name, start_date, end_date) values ('0b000000-0000-0000-0000-000000000001', 'rel-serie', '${O1}', 'Serie', '2099-01-01', '2099-12-31');
    insert into event_series_template (series_id, city, venue) values ('0b000000-0000-0000-0000-000000000001', 'Monterrey', 'ARENA NORTE');
  `);
  await old.exec(readFileSync(`${dir}/0052_arenas.sql`, "utf8"));
  const q = async (sql) => (await old.query(sql)).rows;
  const arenas = await q("select organizer_id, name, city, key from arenas order by organizer_id, key");
  check("una arena por organizador y lugar (3: Arena Norte y Lienzo Sur de uno, Arena Norte del otro)", arenas.length === 3);
  const norte = arenas.find((a) => a.organizer_id === O1 && a.key === "arena norte");
  check("con la escritura más usada y la ciudad más común", norte?.name === "Arena Norte" && norte?.city === "Monterrey");
  check("la arena del otro organizador es aparte, con su ciudad", arenas.some((a) => a.organizer_id === O2 && a.key === "arena norte" && a.city === "Saltillo"));
  check("los eventos con lugar quedaron enlazados (5) y el vacío no", (await q("select count(*)::int n from events where arena_id is not null"))[0].n === 5 && (await q("select count(*)::int n from events where slug = 'rel-5' and arena_id is null"))[0].n === 1);
  check("las dos escrituras de Arena Norte apuntan a la misma arena", (await q("select count(distinct arena_id)::int n from events where slug in ('rel-1','rel-2','rel-3')"))[0].n === 1);
  check("la plantilla de la serie también se enlazó", (await q("select count(*)::int n from event_series_template t join arenas a on a.id = t.arena_id where a.key = 'arena norte' and a.organizer_id = '" + O1 + "'"))[0].n === 1);
  check("el texto de los eventos no cambió", (await q("select venue from events where slug = 'rel-2'"))[0].venue === "arena  norte.");
  check("events.updated_at no se movió", (await q("select count(*)::int n from events where updated_at >= now() - interval '1 hour'"))[0].n === 0);
  await old.close();
}

// Un organizador que además compite (KIN-627): las reglas le dejan leer DOS cosas distintas (lo de sus eventos y lo suyo en eventos ajenos), así
// que la app tiene que filtrar según lo que muestra. Aquí se fija ese comportamiento y que cada filtro devuelve solo lo que toca.
console.log("— Organizador que además compite");
{
  const MIO = "e0000000-0000-0000-0000-0000000000f1", AJENO = "e0000000-0000-0000-0000-0000000000f2";
  const C1 = "ca000000-0000-0000-0000-0000000000f1", C2 = "ca000000-0000-0000-0000-0000000000f2";
  const YO = "22222222-0000-0000-0000-0000000000f1", OTRO = "22222222-0000-0000-0000-0000000000f2";
  const U1 = "f1f1f1f1-0000-0000-0000-000000000001", U2 = "f1f1f1f1-0000-0000-0000-000000000002";
  await db.exec(`reset role;
    insert into auth.users (id, email, email_confirmed_at) values ('${U1}','org-compite@x.com',now()), ('${U2}','otro-org@x.com',now());
    insert into profiles (user_id, role, display_name) values ('${U1}','organizador','Org Compite'), ('${U2}','organizador','Otro Org');
    insert into ropers (id, full_name, user_id) values ('${YO}','Org Compite','${U1}'), ('${OTRO}','Otro Lazador',null);
    insert into events (id, name, organizer_id, status, slug, capacity, disciplines) values ('${MIO}','Mío','${U1}','publicado','kin627-mio',10,'{lazo}'), ('${AJENO}','Ajeno','${U2}','publicado','kin627-ajeno',10,'{lazo}');
    insert into event_categories (id, event_id, name, fee_cents) values ('${C1}','${MIO}','Libre',100), ('${C2}','${AJENO}','Libre',200);
    insert into registrations (event_id, roper_id, category_id, amount_cents) values ('${MIO}','${OTRO}','${C1}',100), ('${AJENO}','${YO}','${C2}',200);
  `);
  const ambos = `event_id in ('${MIO}','${AJENO}')`;
  const solo = (where, monto) => `select 1 from (select array_agg(r.amount_cents) m from registrations r join events e on e.id = r.event_id where r.${ambos} and ${where}) x where m = array[${monto}]`;
  await as("authenticated", U1, `select 1 where (select count(*) from registrations where ${ambos}) = 2`, "sin filtro ve lo de su evento Y lo suyo en otro", "some");
  await as("authenticated", U1, solo(`r.roper_id = '${YO}'`, 200), "filtrando por su perfil: solo su inscripción", "some");
  await as("authenticated", U1, solo(`e.organizer_id = '${U1}'`, 100), "filtrando por sus eventos: solo lo que él cobra", "some");
}

// Resumen de pagos por evento y filtro por arena (KIN-765): son las MISMAS consultas que hace src/lib/data/payments.ts, ejecutadas con la sesión de cada
// organizador. Fija que cada quien solo ve el dinero y la lista de espera de SUS eventos, que el filtro por arena acota todo igual, y que un evento
// sin inscripciones o un organizador sin arenas devuelven ceros/vacío sin error.
console.log("— Resumen de pagos por evento y arena (KIN-765)");
{
  const check = (label, ok) => { if (!ok) failures++; console.log(`${ok ? "✔" : "✘ FALLO"}  ${label.padEnd(58)} → ${ok ? "ok" : "NO"}`); };
  const U1 = "76500000-0000-0000-0000-000000000001", U2 = "76500000-0000-0000-0000-000000000002", U3 = "76500000-0000-0000-0000-000000000003";
  const AR1 = "a7650000-0000-0000-0000-000000000001", AR2 = "a7650000-0000-0000-0000-000000000002", AR_OTRO = "a7650000-0000-0000-0000-000000000009";
  const E1 = "e7650000-0000-0000-0000-000000000001", E2 = "e7650000-0000-0000-0000-000000000002", E3 = "e7650000-0000-0000-0000-000000000003", E_OTRO = "e7650000-0000-0000-0000-000000000009";
  const K1 = "c7650000-0000-0000-0000-000000000001", K2 = "c7650000-0000-0000-0000-000000000002", K_OTRO = "c7650000-0000-0000-0000-000000000009";
  const R = [1, 2, 3, 4, 5].map((i) => `37650000-0000-0000-0000-00000000000${i}`);
  await db.exec(`reset role;
    insert into auth.users (id, email, email_confirmed_at) values ('${U1}','k765-1@x.com',now()), ('${U2}','k765-2@x.com',now()), ('${U3}','k765-3@x.com',now());
    insert into profiles (user_id, role, display_name) values ('${U1}','organizador','Org Uno'), ('${U2}','organizador','Org Dos'), ('${U3}','organizador','Org Sin Arenas');
    insert into arenas (id, organizer_id, name) values ('${AR1}','${U1}','Arena Norte'), ('${AR2}','${U1}','Arena Sur'), ('${AR_OTRO}','${U2}','Arena Ajena');
    insert into events (id, name, organizer_id, status, slug, capacity, disciplines, arena_id) values
      ('${E1}','Norte Uno','${U1}','publicado','k765-norte-uno',10,'{lazo}','${AR1}'),
      ('${E2}','Sur Uno','${U1}','publicado','k765-sur-uno',10,'{lazo}','${AR2}'),
      ('${E3}','Norte Vacío','${U1}','publicado','k765-norte-vacio',10,'{lazo}','${AR1}'),
      ('${E_OTRO}','Ajeno','${U2}','publicado','k765-ajeno',10,'{lazo}','${AR_OTRO}');
    insert into event_categories (id, event_id, name, fee_cents) values ('${K1}','${E1}','Libre',100000), ('${K2}','${E2}','Libre',50000), ('${K_OTRO}','${E_OTRO}','Libre',70000);
    insert into ropers (id, full_name) values ${R.map((r, i) => `('${r}','K765 Persona ${i + 1}')`).join(", ")};
    insert into registrations (event_id, roper_id, category_id, amount_cents, payment_status) values
      ('${E1}','${R[0]}','${K1}',100000,'pagado'), ('${E1}','${R[1]}','${K1}',100000,'pendiente'), ('${E1}','${R[2]}','${K1}',100000,'reembolsado'),
      ('${E2}','${R[0]}','${K2}',50000,'pendiente'), ('${E_OTRO}','${R[3]}','${K_OTRO}',70000,'pagado');
    insert into event_waitlist (event_id, roper_id, category_id) values ('${E1}','${R[3]}','${K1}'), ('${E1}','${R[4]}','${K1}'), ('${E_OTRO}','${R[0]}','${K_OTRO}');
  `);
  const rows = async (uid, sql) => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated`);
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  // Lo que suma listPaymentTotals: solo pendiente y pagado, solo eventos del organizador, con o sin arena.
  const totals = (uid, arena) => rows(uid, `select r.event_id, count(*) filter (where r.payment_status = 'pagado')::int paid, count(*) filter (where r.payment_status = 'pendiente')::int pending,
    coalesce(sum(r.amount_cents),0)::int expected from registrations r join events e on e.id = r.event_id
    where e.organizer_id = '${uid}' and r.payment_status in ('pendiente','pagado') ${arena ? `and e.arena_id = '${arena}'` : ""} group by r.event_id order by r.event_id`);
  const waiting = (uid, arena) => rows(uid, `select w.event_id, count(*)::int n from event_waitlist w join events e on e.id = w.event_id where e.organizer_id = '${uid}' ${arena ? `and e.arena_id = '${arena}'` : ""} group by w.event_id`);

  const all = await totals(U1, null);
  check("sin filtro: pagadas y pendientes de sus dos eventos con inscripciones", all.length === 2 && all[0].event_id === E1 && all[0].paid === 1 && all[0].pending === 1 && all[0].expected === 200000 && all[1].event_id === E2 && all[1].pending === 1);
  check("una inscripción reembolsada NO cuenta en el dinero ni en los números", all[0].paid + all[0].pending === 2);
  const norte = await totals(U1, AR1);
  check("filtrar por arena deja solo los eventos de esa arena", norte.length === 1 && norte[0].event_id === E1 && norte[0].expected === 200000);
  check("la suma por arenas es el total sin filtro", (await totals(U1, AR1)).concat(await totals(U1, AR2)).reduce((a, x) => a + x.expected, 0) === all.reduce((a, x) => a + x.expected, 0));
  check("la lista de espera se cuenta aparte, por evento", JSON.stringify(await waiting(U1, null)) === JSON.stringify([{ event_id: E1, n: 2 }]));
  check("la lista de espera también se filtra por arena", (await waiting(U1, AR2)).length === 0 && (await waiting(U1, AR1))[0].n === 2);
  check("un evento sin inscripciones aparece en sus eventos y no tiene totales (cero)", (await rows(U1, `select id from events where organizer_id = '${U1}' and arena_id = '${AR1}' order by id`)).length === 2 && !norte.some((t) => t.event_id === E3));

  check("otro organizador NO ve las inscripciones ni el dinero de estos eventos", (await rows(U2, `select id from registrations where event_id in ('${E1}','${E2}')`)).length === 0);
  check("otro organizador NO ve la lista de espera de estos eventos", (await rows(U2, `select id from event_waitlist where event_id = '${E1}'`)).length === 0);
  check("sus totales solo traen lo suyo, nunca lo de otro organizador", JSON.stringify((await totals(U2, null)).map((t) => t.event_id)) === JSON.stringify([E_OTRO]));
  check("filtrar con la arena de OTRO organizador no devuelve nada", (await totals(U1, AR_OTRO)).length === 0 && (await waiting(U1, AR_OTRO)).length === 0);
  check("otro organizador NO ve las arenas de este", (await rows(U2, `select id from arenas where id in ('${AR1}','${AR2}')`)).length === 0);
  check("un organizador sin arenas ni eventos recibe todo vacío, sin error", (await rows(U3, "select id from arenas")).length === 0 && (await totals(U3, null)).length === 0 && (await waiting(U3, null)).length === 0);
}

console.log("- Pagos que sube la app (0053)");
{
  const example = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../docs/sync-examples/${name}`, import.meta.url)), "utf8"));
  const request = example("pagos.request.json"), expected = example("pagos.response.json");
  const EVP = request.payments[0].event_id, EVP_OTHER = "f8d1b9a0-1111-4222-8333-444455556666";
  const [P1, P2x, P3, P4] = request.payments.map((p) => p.roper_global_id);
  const P5 = "4abe9196-6666-4777-8888-9999aaaabbbb";
  await db.exec(`
    insert into events (id, name, organizer_id, status, slug) values ('${EVP}','Evento pagos','${A}','publicado','pagos-0053'), ('${EVP_OTHER}','Evento de otro','${B}','publicado','otro-0053') on conflict do nothing;
    insert into ropers (id, full_name) values ('${P1}','Pagador Uno'), ('${P2x}','Pagador Dos'), ('${P3}','Pagador Tres'), ('${P4}','Pagador Cuatro'), ('${P5}','Sin inscribir') on conflict do nothing;
    insert into registrations (event_id, roper_id) values ('${EVP}','${P1}'), ('${EVP}','${P2x}'), ('${EVP}','${P3}'), ('${EVP}','${P4}');
    update registrations set payment_status = 'pagado', payment_method = 'stripe', provider_payment_id = 'pi_test_0053', paid_at = now() where event_id = '${EVP}' and roper_id = '${P4}';
  `);
  const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const asServer = async (sql) => {
    await db.exec("reset role; set role service_role");
    try { return (await db.query(sql)).rows; } finally { await db.exec("reset role"); }
  };
  const pay = (organizer, payments) => asServer(`select * from public.app_upload_payments('${organizer}', ${sqlText(JSON.stringify(payments))}::jsonb, null)`);
  const one = (overrides) => ({ ...request.payments[0], id: "b2d3f4a5-0000-4000-8000-0000000000ff", ...overrides });
  const reg = async (roper) => (await db.query(`select payment_status, payment_method, amount_paid_cents, payment_note, paid_by_roper_id, payment_revision, paid_at from registrations where event_id = '${EVP}' and roper_id = '${roper}'`)).rows[0];

  // 1) El ejemplo del contrato: lo que la base responde es lo que el ejemplo dice (por pago y en orden).
  const first = await pay(A, request.payments);
  await check("ejemplo del contrato: estado y motivo de cada pago", JSON.stringify(first.map((r) => [r.r_id, r.r_status, r.r_code ?? null, r.r_revision, r.r_retry]))
    === JSON.stringify(expected.payments.map((r) => [r.id, r.status, r.code ?? null, r.revision ?? null, r.retry ?? false])));
  const r1 = await reg(P1), r2 = await reg(P2x), r3 = await reg(P3), r4 = await reg(P4);
  await check("efectivo: queda pagado con monto, forma y fecha", r1.payment_status === "pagado" && r1.payment_method === "efectivo" && r1.amount_paid_cents === 30000 && r1.paid_at !== null);
  await check("un abono parcial sigue pendiente pero guarda lo pagado y la nota", r2.payment_status === "pendiente" && r2.amount_paid_cents === 10000 && r2.payment_note === "Abonó 100, faltan 200" && r2.paid_at === null);
  await check("pagar por otra persona deja ligado a quien pagó", r3.payment_status === "pagado" && r3.payment_method === "transferencia" && r3.paid_by_roper_id === P1);
  await check("un pago en línea NO se deshace desde la app", r4.payment_status === "pagado" && r4.payment_method === "stripe" && r4.payment_revision === 0);

  // 2) Idempotencia, correcciones y revisiones.
  const again = await pay(A, request.payments);
  await check("reenviar el mismo lote: unchanged y nada nuevo (el de Stripe sigue rechazado)", JSON.stringify(again.map((r) => r.r_status)) === JSON.stringify(["unchanged", "unchanged", "unchanged", "rejected"]));
  const fix = await pay(A, [{ ...request.payments[1], revision: 2, status: "pagado", method: "transferencia", paid_cents: 30000, note: "Completó el pago" }]);
  await check("corrección con revisión mayor: updated", fix[0].r_status === "updated" && fix[0].r_revision === 2 && (await reg(P2x)).payment_status === "pagado");
  const stale = await pay(A, [{ ...request.payments[1], revision: 2, status: "pendiente", method: null, paid_cents: 0 }]);
  await check("revisión menor o igual con datos distintos: stale_revision", stale[0].r_status === "rejected" && stale[0].r_code === "stale_revision" && (await reg(P2x)).payment_status === "pagado");
  const undo = await pay(A, [{ ...request.payments[1], revision: 3, status: "pendiente", method: null, paid_cents: 0, note: null }]);
  await check("deshacer un pago manual con revisión mayor: vuelve a pendiente sin fecha", undo[0].r_status === "updated" && (await reg(P2x)).payment_status === "pendiente" && (await reg(P2x)).paid_at === null);
  const sameStripe = await pay(A, [one({ roper_global_id: P4, status: "pagado", method: "transferencia", paid_cents: 30000 })]);
  await check("si la app también dice pagado a quien pagó en línea: unchanged", sameStripe[0].r_status === "unchanged");

  // 3) Rechazos con su motivo.
  const rejects = await pay(A, [
    one({ id: "b2d3f4a5-0000-4000-8000-0000000000a1", roper_global_id: P5 }),
    one({ id: "b2d3f4a5-0000-4000-8000-0000000000a2", event_id: EVP_OTHER }),
    one({ id: "b2d3f4a5-0000-4000-8000-0000000000a3", paid_by_global_id: "99999999-9999-4999-8999-999999999999" }),
    one({ id: "b2d3f4a5-0000-4000-8000-0000000000a4", method: "stripe" }),
    one({ id: "b2d3f4a5-0000-4000-8000-0000000000a5", status: "pendiente", method: "efectivo" }),
    one({ id: "b2d3f4a5-0000-4000-8000-0000000000a6", paid_cents: -1 }),
    one({ id: "b2d3f4a5-0000-4000-8000-0000000000a7", revision: 0 }),
  ]);
  await check("rechazos: persona sin inscribir, evento ajeno, quien pagó desconocido y campos inválidos", JSON.stringify(rejects.map((r) => r.r_code))
    === JSON.stringify(["registration_not_found", "event_not_found", "roper_unknown", "invalid_field", "invalid_field", "invalid_field", "invalid_field"]));
  await db.exec(`update registrations set payment_status = 'reembolsado' where event_id = '${EVP}' and roper_id = '${P3}'`);
  const refunded = await pay(A, [{ ...request.payments[2], revision: 5, paid_cents: 1 }]);
  await check("una inscripción reembolsada no se toca desde la app", refunded[0].r_code === "refunded");
  await check("otro organizador no puede escribir pagos de un evento ajeno", (await pay(B, [request.payments[0]]))[0].r_code === "event_not_found");

  // Varias inscripciones de la misma persona en el evento (p. ej. rol "Ambos"): el pago es el total de la persona.
  const K = "ca000000-0000-0000-0000-000000005301";
  const [M1, M2, M3] = ["53000000-0000-4000-8000-000000000001", "53000000-0000-4000-8000-000000000002", "53000000-0000-4000-8000-000000000003"];
  await db.exec(`
    reset role;
    insert into event_categories (id, event_id, name, fee_cents) values ('${K}','${EVP}','Doble',20000);
    insert into ropers (id, full_name) values ('${M1}','Doble Uno'), ('${M2}','Doble En Linea'), ('${M3}','Doble Reembolso');
    insert into registrations (event_id, roper_id, category_id, role, amount_cents, created_at)
      select '${EVP}', p::uuid, '${K}', x.role, 20000, x.at::timestamptz
      from unnest(array['${M1}','${M2}','${M3}']) p, (values ('header','2026-01-01'), ('heeler','2026-01-02')) x(role, at);
    update registrations set payment_status = 'pagado', payment_method = 'stripe', provider_payment_id = 'pi_test_0053_m2', paid_at = now() where roper_id = '${M2}' and role = 'header';
    update registrations set payment_status = 'reembolsado' where roper_id = '${M3}' and role = 'header';
  `);
  const both = async (roper) => (await db.query(`select payment_status s, payment_method m, amount_paid_cents c, payment_revision v from registrations where event_id = '${EVP}' and roper_id = '${roper}' order by created_at`)).rows;
  const shape = (rows) => JSON.stringify(rows.map((r) => [r.s, r.m, r.c, r.v]));
  const multi = (n, roper, extra) => one({ id: `b2d3f4a5-0000-4000-8000-00000000530${n}`, roper_global_id: roper, paid_by_global_id: null, note: null, ...extra });

  const part = multi(1, M1, { status: "pendiente", method: null, paid_cents: 25000 });
  await pay(A, [part]);
  await check("dos inscripciones, abono parcial: ambas pendientes y el monto repartido sin duplicarse", shape(await both(M1)) === JSON.stringify([["pendiente", null, 20000, 1], ["pendiente", null, 5000, 1]]));
  await check("reenviar ese abono: unchanged", (await pay(A, [part]))[0].r_status === "unchanged");
  const full = await pay(A, [{ ...part, revision: 2, status: "pagado", method: "efectivo", paid_cents: 40000 }]);
  await check("dos inscripciones, pago completo: las dos quedan pagadas", full[0].r_status === "updated" && shape(await both(M1)) === JSON.stringify([["pagado", "efectivo", 20000, 2], ["pagado", "efectivo", 20000, 2]]));
  await pay(A, [{ ...part, revision: 3, status: "pagado", method: "efectivo", paid_cents: 45000 }]);
  await check("si paga de más, el sobrante queda en la última", (await both(M1)).map((r) => r.c).join() === "20000,25000");

  const mixed = await pay(A, [multi(2, M2, { status: "pagado", method: "efectivo", paid_cents: 40000 })]);
  await check("una en línea y otra no: la de Stripe queda intacta y la otra se paga solo con lo restante", mixed[0].r_status === "accepted" && shape(await both(M2)) === JSON.stringify([["pagado", "stripe", null, 0], ["pagado", "efectivo", 20000, 1]]));

  const withRefund = await pay(A, [multi(3, M3, { status: "pagado", method: "transferencia", paid_cents: 20000 })]);
  await check("una reembolsada y otra no: la reembolsada no se toca y la otra se paga", withRefund[0].r_status === "accepted" && shape(await both(M3)) === JSON.stringify([["reembolsado", null, null, 0], ["pagado", "transferencia", 20000, 1]]));

  // 4) Permisos: solo el servidor escribe; la bitácora es del organizador.
  for (const [role, uid, label] of [["anon", null, "anónimo"], ["authenticated", A, "un organizador"], ["authenticated", C, "un participante"]]) {
    await as(role, uid, `select * from public.app_upload_payments('${A}', '[]'::jsonb, null)`, `${label} NO sube pagos por la API pública`, "deny");
  }
  await as("authenticated", A, `update registrations set payment_note = 'x', payment_revision = 99 where event_id = '${EVP}'`, "un organizador NO edita la revisión ni la nota directo", "deny");
  await as("authenticated", A, "select id from payment_uploads", "el organizador ve sus subidas de pagos", "some");
  await as("authenticated", B, "select id from payment_uploads where organizer_id = '" + A + "'", "otro organizador NO ve esas subidas", "deny");
  await as("anon", null, "select id from payment_uploads", "anónimo NO ve las subidas de pagos", "deny");
  await check("el servidor SÍ ejecuta la función", (await pay(A, [request.payments[0]])).length === 1);
}

console.log("— Enlace privado por evento (0059, KIN-783)");
{
  const O1 = "f5600000-0000-0000-0000-0000000000a1", O2 = "f5600000-0000-0000-0000-0000000000b1";
  const EVN = "e5600000-0000-0000-0000-000000000001", EVN2 = "e5600000-0000-0000-0000-000000000002", EVB = "e5600000-0000-0000-0000-000000000003", EVO = "e5600000-0000-0000-0000-000000000004";
  const RP = (n) => `a5600000-0000-0000-0000-00000000010${n}`;
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${O1}','o1-56@x.com',now()), ('${O2}','o2-56@x.com',now());
    insert into profiles (user_id, role, display_name, organizer_verified) values ('${O1}','organizador','Org 56 A',true), ('${O2}','organizador','Org 56 B',true);
    insert into events (id, name, organizer_id, status, slug, event_date) values
      ('${EVN}','Enlace uno','${O1}','publicado','e56-1', current_date + 10),
      ('${EVN2}','Enlace dos','${O1}','publicado','e56-2', current_date + 20),
      ('${EVB}','Enlace borrador','${O1}','borrador','e56-3', current_date + 10),
      ('${EVO}','Enlace de otro','${O2}','publicado','e56-4', current_date + 10);
    insert into ropers (id, full_name) values ('${RP(1)}','Lazador 1'), ('${RP(2)}','Lazador 2'), ('${RP(3)}','Lazador 3');
  `);
  const svc = async (sql, params = []) => { await db.exec("reset role; set role service_role"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); } };
  const fails = async (sql, params, code) => { try { await svc(sql, params); return false; } catch (e) { return String(e.message ?? e).includes(code); } };
  const arr = (scopes) => `{${scopes.join(",")}}`;
  const create = async (org, ev, hash, scopes = ["event:read"], label = "Mesa 1") =>
    (await svc("select public.create_event_connection($1, $2, $3, $4, $5::text[]) as id", [org, ev, hash, label, arr(scopes)]))[0].id;
  const failCreate = (org, ev, hash, scopes, code) => fails("select public.create_event_connection($1, $2, $3, 'x', $4::text[])", [org, ev, hash, arr(scopes)], code);
  const redeem = async (invite, token, device = "Laptop") => (await svc("select * from public.redeem_event_connection($1, $2, $3)", [invite, token, device]));
  const verify = async (hash) => (await svc("select * from public.verify_event_token($1)", [hash]));
  const W = ["event:read", "results:write", "payments:write"];

  // --- crear
  const w1 = await create(O1, EVN, "inv-w1", W);
  await check("el organizador dueño crea la invitación de un evento publicado", !!w1);
  await check("los permisos incluyen siempre event:read", (await db.query(`select scopes from event_connections where id = '${w1}'`)).rows[0].scopes.includes("event:read"));
  await check("sin pedir permisos, el enlace queda con event:read", (await db.query(`select scopes from event_connections where id = '${await create(O1, EVN2, "inv-solo-lectura", [])}'`)).rows[0].scopes.join() === "event:read");
  await check("un borrador NO tiene enlace (not_published)", await failCreate(O1, EVB, "inv-b", ["event:read"], "not_published"));
  await check("un evento ajeno NO tiene enlace (not_found)", await failCreate(O1, EVO, "inv-o", ["event:read"], "not_found"));
  await check("permisos desconocidos se rechazan (invalid_scopes)", await failCreate(O1, EVN, "inv-s", ["event:read", "pagos:todo"], "invalid_scopes"));
  await check("un solo escritor por evento: el segundo con results:write NO se crea (writer_exists)", await failCreate(O1, EVN, "inv-w2", ["results:write"], "writer_exists"));
  await check("sí caben enlaces de solo lectura junto al escritor", !!(await create(O1, EVN, "inv-r1")) && !!(await create(O1, EVN, "inv-r2")));
  await check("el límite es de 5 enlaces activos por evento", !!(await create(O1, EVN, "inv-r3")) && !!(await create(O1, EVN, "inv-r4"))
    && await failCreate(O1, EVN, "inv-r5", ["event:read"], "limit"));
  await check("otro evento del mismo organizador tiene su propio escritor", !!(await create(O1, EVN2, "inv-w-evn2", ["results:write"])));
  await check("la invitación dura 72 horas", (await db.query("select (invite_expires_at - created_at) = interval '72 hours' as ok from event_connections where invite_hash = 'inv-r2'")).rows[0].ok === true);

  // --- canjear
  const rw = await redeem("inv-w1", "tok-w1", "  Laptop de la mesa  ");
  await check("canjear devuelve el evento, el organizador y los permisos", rw.length === 1 && rw[0].event_id === EVN && rw[0].organizer_id === O1 && rw[0].scopes.join() === "event:read,payments:write,results:write");
  await check("el nombre del equipo se limpia y se guarda", (await db.query("select device_name from event_connections where token_hash = 'tok-w1'")).rows[0].device_name === "Laptop de la mesa");
  await check("la invitación es de un solo uso: canjearla otra vez no devuelve nada", (await redeem("inv-w1", "tok-otro")).length === 0);
  await check("una invitación desconocida no se canjea", (await redeem("no-existe", "tok-x")).length === 0);
  await redeem("inv-r3", "tok-r3");
  await db.exec("update event_connections set invite_expires_at = now() - interval '1 minute' where invite_hash = 'inv-r1'");
  await check("una invitación vencida (72 h) no se canjea", (await redeem("inv-r1", "tok-r1")).length === 0);
  await db.exec("update event_connections set invite_expires_at = now() - interval '1 minute' where invite_hash = 'inv-w-evn2'");
  await check("la invitación vencida del escritor libera su lugar: otro escritor ya cabe", !!(await create(O1, EVN2, "inv-w-evn2-b", ["results:write"])));

  // --- verificar
  const v = await verify("tok-w1");
  await check("el token canjeado se verifica: organizador dueño, evento, permisos y estado del evento",
    v.length === 1 && v[0].organizer_id === O1 && v[0].event_id === EVN && v[0].event_status === "publicado" && v[0].scopes.includes("results:write"));
  await check("un token desconocido o una invitación sin canjear NO sirven como token", (await verify("nada")).length === 0 && (await verify("inv-r2")).length === 0);
  const before = (await db.query("select last_used_at::text as t from event_connections where token_hash = 'tok-w1'")).rows[0].t;
  await verify("tok-w1");
  await check("last_used_at se escribe como máximo una vez por minuto", (await db.query("select last_used_at::text as t from event_connections where token_hash = 'tok-w1'")).rows[0].t === before);
  await db.exec("update event_connections set last_used_at = now() - interval '31 days', created_at = now() - interval '40 days' where token_hash = 'tok-w1'");
  await check("a los 31 días sin uso el token vence", (await verify("tok-w1")).length === 0);
  await db.exec("update event_connections set last_used_at = now() - interval '29 days' where token_hash = 'tok-w1'");
  await check("a los 29 días sigue sirviendo y ese uso reinicia el plazo", (await verify("tok-w1")).length === 1
    && (await db.query("select last_used_at > now() - interval '1 minute' as fresh from event_connections where token_hash = 'tok-w1'")).rows[0].fresh === true);
  await db.exec(`update events set event_date = current_date - 7 where id = '${EVN}'`);
  await check("hasta 7 días después de la fecha del evento el token sigue sirviendo", (await verify("tok-w1")).length === 1);
  await db.exec(`update events set event_date = current_date - 8 where id = '${EVN}'`);
  await check("a los 8 días de la fecha del evento el token vence aunque se haya usado hoy", (await verify("tok-w1")).length === 0);
  await db.exec(`update events set event_date = current_date + 10 where id = '${EVN}'`);
  await db.exec(`update events set status = 'borrador' where id = '${EVN}'`);
  await check("si el evento vuelve a borrador, el token se reconoce pero avisa el estado (la ruta responde 404)", (await verify("tok-w1"))[0]?.event_status === "borrador");
  await check("un evento en borrador ya no canjea invitaciones", (await redeem("inv-r4", "tok-r4")).length === 0);
  await db.exec(`update events set status = 'publicado' where id = '${EVN}'`);

  // --- un solo escritor y revocación
  await check("otro organizador NO puede revocar un enlace ajeno", (await svc("select public.revoke_event_connection($1, $2) as ok", [O2, w1]))[0].ok === false && (await verify("tok-w1")).length === 1);
  await check("revocar libera el lugar del escritor y el token deja de servir al instante",
    (await svc("select public.revoke_event_connection($1, $2) as ok", [O1, w1]))[0].ok === true && (await verify("tok-w1")).length === 0 && !!(await create(O1, EVN, "inv-w3", ["results:write"], "Mesa 2")));
  await check("revocar dos veces devuelve false, sin error", (await svc("select public.revoke_event_connection($1, $2) as ok", [O1, w1]))[0].ok === false);
  await redeem("inv-w3", "tok-w3");
  await check("cerrar sesión con el token revoca solo ese enlace", (await svc("select public.revoke_event_connection_by_token($1) as ok", ["tok-w3"]))[0].ok === true
    && (await verify("tok-w3")).length === 0 && (await verify("tok-r3")).length === 1);
  await check("cerrar sesión con un token que ya no existe devuelve false", (await svc("select public.revoke_event_connection_by_token($1) as ok", ["tok-w3"]))[0].ok === false);

  // --- un token de evento solo descarga su evento
  const only = await svc("select id from public.app_organizer_events($1, null, now() + interval '1 hour', null, null, 50, $2)", [O1, EVN]);
  await check("app_organizer_events con un evento devuelve solo ese evento", only.length === 1 && only[0].id === EVN);
  const all = await svc("select id from public.app_organizer_events($1, null, now() + interval '1 hour', null, null, 50)", [O1]);
  await check("sin evento devuelve todos los publicados del organizador, como antes", all.some((r) => r.id === EVN) && all.some((r) => r.id === EVN2) && !all.some((r) => r.id === EVB));
  await check("pedir un evento ajeno devuelve vacío (no revela nada)", (await svc("select id from public.app_organizer_events($1, null, now() + interval '1 hour', null, null, 50, $2)", [O1, EVO])).length === 0);

  // --- candado: con un escritor activo y resultados abiertos no se borran resultados
  const RES = (n) => `e5600000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
  const insertResult = (n) => db.exec(`insert into event_results (id, event_id, roper_id, discipline, disqualified) values ('${RES(n)}', '${EVN}', '${RP(n)}', 'lazo', false)`);
  const gone = async (n) => (await db.query(`select count(*)::int as n from event_results where id = '${RES(n)}'`)).rows[0].n === 0;
  await insertResult(1);
  await db.exec(`delete from event_results where id = '${RES(1)}'`); // todavía no hay escritor activo
  await check("sin escritor activo se pueden borrar resultados como siempre", await gone(1));
  await create(O1, EVN, "inv-w4", ["results:write"], "Mesa 3");
  await insertResult(2);
  await check("con un escritor activo y el evento abierto NO se borran resultados (connected_event)", await (async () => { try { await db.exec(`delete from event_results where id = '${RES(2)}'`); return false; } catch (e) { return String(e.message ?? e).includes("connected_event"); } })());
  await db.exec(`update events set results_closed_at = now() where id = '${EVN}'`);
  await db.exec(`delete from event_results where id = '${RES(2)}'`);
  await check("con los resultados cerrados el candado no aplica", await gone(2));
  await db.exec(`update events set results_closed_at = null where id = '${EVN}'`);
  await insertResult(3);
  await db.exec("update event_connections set revoked_at = now() where invite_hash = 'inv-w4'");
  await db.exec(`delete from event_results where id = '${RES(3)}'`);
  await check("al revocar el enlace de escritura el candado se levanta", await gone(3));

  // --- permisos: solo el servidor
  for (const [fn, args] of [
    ["create_event_connection", `'${O1}', '${EVN2}', 'x-perm', 'x', array['event:read']`], ["redeem_event_connection", `'x', 'x', 'x'`],
    ["verify_event_token", `'x'`], ["revoke_event_connection", `'${O1}', '${w1}'`], ["revoke_event_connection_by_token", `'x'`],
  ]) {
    await as("anon", null, `select public.${fn}(${args})`, `anónimo NO ejecuta ${fn}`, "deny");
    await as("authenticated", O1, `select public.${fn}(${args})`, `un organizador NO ejecuta ${fn}`, "deny");
  }
  await as("authenticated", O1, `select id, event_id, label, scopes, invite_expires_at, redeemed_at, created_at, last_used_at, revoked_at from event_connections where organizer_id = '${O1}'`, "el organizador ve sus enlaces (sin los secretos)", "some");
  await as("authenticated", O1, "select invite_hash from event_connections", "NO ve el hash de la invitación", "deny");
  await as("authenticated", O1, "select token_hash from event_connections", "NO ve el hash del token", "deny");
  await as("authenticated", O2, `select id from event_connections where organizer_id = '${O1}'`, "NO ve los enlaces de otro organizador", "deny");
  await as("authenticated", O1, `insert into event_connections (event_id, organizer_id, invite_hash, invite_expires_at) values ('${EVN2}', '${O1}', 'directo', now() + interval '1 day')`, "NO crea enlaces directo (se saltaría el límite)", "deny");
  await as("authenticated", O1, `update event_connections set revoked_at = null, scopes = array['event:read','results:write'] where organizer_id = '${O1}'`, "NO reactiva ni amplía un enlace directo", "deny");
  await as("anon", null, "select id from event_connections", "anónimo NO ve enlaces", "deny");
}

console.log("— Resultados en vivo (0063, KIN-787)");
{
  const OL = "f6300000-0000-0000-0000-0000000000a1", OL2 = "f6300000-0000-0000-0000-0000000000b1";
  const EP = "e6300000-0000-0000-0000-000000000001", EPRIV = "e6300000-0000-0000-0000-000000000002", EBOR = "e6300000-0000-0000-0000-000000000003", EAJ = "e6300000-0000-0000-0000-000000000004", EFIN = "e6300000-0000-0000-0000-000000000005";
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${OL}','ol-63@x.com',now()), ('${OL2}','ol2-63@x.com',now());
    insert into profiles (user_id, role, display_name, organizer_verified) values ('${OL}','organizador','Org 63 A',true), ('${OL2}','organizador','Org 63 B',true);
    insert into events (id, name, organizer_id, status, slug, venue, city, event_date, visibility) values
      ('${EP}','En vivo público','${OL}','publicado','e63-1','Arena Uno','Monterrey', current_date, 'publico'),
      ('${EPRIV}','En vivo privado','${OL}','publicado','e63-2','Arena Dos','Saltillo', current_date, 'privado'),
      ('${EBOR}','En vivo borrador','${OL}','borrador','e63-3',null,null, current_date, 'publico'),
      ('${EAJ}','En vivo de otro','${OL2}','publicado','e63-4',null,null, current_date, 'publico'),
      ('${EFIN}','En vivo finalizado','${OL}','finalizado','e63-5',null,null, current_date - 3, 'publico');
  `);
  const svc = async (sql, params = []) => { await db.exec("reset role; set role service_role"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role"); } };
  const put = async (org, ev, rev, snap = { round: 1, rounds: 3, total: 2, done: 1, current: null, pending: [], standings: [] }) =>
    (await svc("select * from public.app_put_live_snapshot($1, $2, $3, $4::jsonb)", [org, ev, rev, JSON.stringify(snap)]))[0];
  const fails = async (sql, params, code) => { try { await svc(sql, params); return false; } catch (e) { return String(e.message ?? e).includes(code); } };
  const snapOf = (round) => ({ round, rounds: 3, total: 2, done: 1, current: null, pending: [], standings: [] });

  // --- guardar
  const first = await put(OL, EP, 5, snapOf(1));
  await check("la primera foto de un evento publicado se guarda", first.outcome === "stored" && Number(first.revision) === 5);
  const again = await put(OL, EP, 5, snapOf(1));
  await check("reenviar la misma revisión es inofensivo (unchanged)", again.outcome === "unchanged");
  const stale = await put(OL, EP, 4, snapOf(9));
  await check("una revisión más vieja NO pisa a la nueva (stale) y avisa la que tiene", stale.outcome === "stale" && Number(stale.revision) === 5);
  await check("la foto vieja no cambió nada", (await db.query(`select (snapshot->>'round')::int as r from event_live_snapshots where event_id = '${EP}'`)).rows[0].r === 1);
  const newer = await put(OL, EP, 6, snapOf(2));
  await check("una revisión mayor reemplaza la foto (una sola fila por evento)", newer.outcome === "stored"
    && (await db.query(`select count(*)::int as n, max((snapshot->>'round')::int) as r from event_live_snapshots where event_id = '${EP}'`)).rows[0].n === 1
    && (await db.query(`select (snapshot->>'round')::int as r from event_live_snapshots where event_id = '${EP}'`)).rows[0].r === 2);
  await check("un borrador NO guarda foto (not_found)", (await put(OL, EBOR, 1)).outcome === "not_found");
  await check("un evento de otro organizador NO guarda foto (not_found)", (await put(OL, EAJ, 1)).outcome === "not_found");
  await check("un evento inexistente NO guarda foto (not_found)", (await put(OL, "e6300000-0000-0000-0000-0000000000ff", 1)).outcome === "not_found");
  await check("un evento finalizado sí guarda su última foto", (await put(OL, EFIN, 1)).outcome === "stored");
  await check("un evento privado guarda foto, aunque nadie la lea en público", (await put(OL, EPRIV, 1)).outcome === "stored");
  await check("una revisión en cero se rechaza", await fails("select * from public.app_put_live_snapshot($1, $2, 0, '{}'::jsonb)", [OL, EP], "inválida"));
  await check("una foto que no es objeto se rechaza", await fails("select * from public.app_put_live_snapshot($1, $2, 9, '[]'::jsonb)", [OL, EP], "inválida"));

  // --- leer: solo eventos públicos publicados o finalizados
  await as("anon", null, `select revision, snapshot, event_name, venue, city from public.get_live_snapshot('${EP}')`, "anónimo lee la foto de un evento público", "some");
  const read = (await svc("select * from public.get_live_snapshot($1)", [EP]))[0];
  await check("la lectura trae el nombre y la arena reales del evento", read.event_name === "En vivo público" && read.venue === "Arena Uno" && read.city === "Monterrey");
  await check("la lectura trae la revisión para el ETag", Number(read.revision) === 6);
  await as("anon", null, `select * from public.get_live_snapshot('${EFIN}')`, "anónimo lee la foto de un evento finalizado", "some");
  await as("anon", null, `select * from public.get_live_snapshot('${EPRIV}')`, "anónimo NO lee la foto de un evento privado", "deny");
  await as("authenticated", OL2, `select * from public.get_live_snapshot('${EPRIV}')`, "otro organizador NO lee la foto de un evento privado", "deny");
  await as("anon", null, `select * from public.get_live_snapshot('${EBOR}')`, "anónimo NO lee la foto de un borrador", "deny");
  await as("anon", null, "select * from public.get_live_snapshot('e6300000-0000-0000-0000-0000000000ff')", "un evento sin foto o inexistente contesta vacío", "deny");
  await db.exec(`update events set status = 'borrador' where id = '${EP}'`);
  await as("anon", null, `select * from public.get_live_snapshot('${EP}')`, "si el evento vuelve a borrador la foto deja de verse", "deny");
  await db.exec(`update events set status = 'publicado' where id = '${EP}'`);
  await check("la lectura pública no trae correos, celulares ni pagos", Object.keys(read).sort().join() === "city,event_name,revision,snapshot,updated_at,venue");

  // --- permisos: la tabla y la escritura son solo del servidor
  await as("anon", null, "select event_id from event_live_snapshots", "anónimo NO lee la tabla directo", "deny");
  await as("authenticated", OL, "select event_id from event_live_snapshots", "un organizador NO lee la tabla directo", "deny");
  await as("authenticated", OL, `insert into event_live_snapshots (event_id, revision, snapshot) values ('${EAJ}', 1, '{}')`, "un organizador NO escribe la tabla directo", "deny");
  await as("authenticated", OL, `update event_live_snapshots set revision = 99 where event_id = '${EP}'`, "un organizador NO edita la tabla directo", "deny");
  await as("anon", null, `select public.app_put_live_snapshot('${OL}', '${EP}', 50, '{}'::jsonb)`, "anónimo NO ejecuta app_put_live_snapshot", "deny");
  await as("authenticated", OL, `select public.app_put_live_snapshot('${OL}', '${EP}', 50, '{}'::jsonb)`, "un organizador NO ejecuta app_put_live_snapshot", "deny");
  await check("borrar el evento borra su foto", await (async () => {
    await db.exec(`delete from events where id = '${EFIN}'`);
    return (await db.query(`select count(*)::int as n from event_live_snapshots where event_id = '${EFIN}'`)).rows[0].n === 0;
  })());
}

console.log(failures ? `\n${failures} comprobación(es) FALLARON` : "\nTodas las comprobaciones de permisos pasan");
process.exit(failures ? 1 : 0);
