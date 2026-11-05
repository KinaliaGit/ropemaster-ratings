import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
// Aplica TODAS las migraciones de supabase/migrations/ en un Postgres de prueba (PGlite) y comprueba quién puede
// ver o escribir qué (anónimo, organizador sin verificar, organizador verificado y participante).
// Se corre con `npm run test:db`. Sale con código 1 si alguna comprobación falla (para usarlo en CI).
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../migrations", import.meta.url));
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(`${dir}/${f}`, "utf8"));
console.log("migraciones 0001-0009 aplicadas en orden\n");

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
console.log("— Fotos en Storage (0011)");
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
await as("authenticated", B, "select public.claim_my_roper('Org')", "un organizador NO usa claim_my_roper", "deny");
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
await as("authenticated", A, `select public.register_for_event('${EV}','${CAT1}')`, "un organizador NO se inscribe", "deny");
await as("anon", null, `select public.register_for_event('${EV}','${CAT1}')`, "anónimo NO se inscribe", "deny");
await as("authenticated", C, "select amount_cents from registrations where category_id = '" + CAT1 + "' and amount_cents = 50000", "el precio sale de la categoría (no del navegador)", "some");
await as("authenticated", C, "select id from registrations", "el participante ve sus inscripciones (2)", "some");
await as("authenticated", P2, "select id from registrations", "otro participante NO ve inscripciones ajenas", "deny");
await as("authenticated", A, "select id from registrations", "el organizador ve las inscripciones de SU evento", "some");
await as("authenticated", B, "select id from registrations", "otro organizador NO las ve", "deny");
await as("anon", null, "select n from public.event_registration_counts() where n = 2", "conteo público de inscritos", "some");
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
await as("authenticated", B, "select phone_e164 from roper_contacts", "sin licencia NO ve el directorio", "deny");
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
await as("authenticated", B, "select phone_e164 from roper_contacts", "licencia VENCIDA: NO ve el directorio", "deny");
await as("authenticated", B, "select public.create_participant('Vencida', 'v@x.com')", "licencia VENCIDA: NO registra participantes", "deny");
await as("authenticated", B, "select id from events where organizer_id = '" + B + "'", "licencia VENCIDA: aún ve sus propios eventos", "some");
await as("authenticated", B, "update profiles set license_valid_until = 'infinity' where user_id = '" + B + "'", "NO se pone una licencia a sí mismo", "deny");
await as("authenticated", B, "update profiles set license_order_id = 'x' where user_id = '" + B + "'", "NO escribe su folio de licencia", "deny");
await db.exec(`update profiles set organizer_verified = true where user_id = '${B}'`);
await as("authenticated", B, "insert into events (id, name, organizer_id, status) values (gen_random_uuid(), 'Aprobado a mano', '" + B + "', 'borrador')", "vencida pero aprobado por un admin: SÍ opera", "some");
console.log("— Participante");
await as("authenticated", C, "select phone_e164 from roper_contacts", "ve SOLO su propio contacto (1)", "some");
await as("authenticated", C, "select organizer_verified from profiles", "ve su perfil (1)", "some");
await as("authenticated", C, "update ropers set avatar_path='mi/foto.jpg' where user_id = '" + C + "'", "NO edita ropers por user_id (columna oculta)", "deny");
await as("authenticated", C, "update ropers set avatar_path='mi/foto.jpg' where id = '11111111-0000-0000-0000-000000000001'", "SÍ cambia la foto de SU perfil", "some");
await as("authenticated", B, "update ropers set avatar_path='hack.jpg' where id = '11111111-0000-0000-0000-000000000001'", "NO cambia la foto de otra persona", "deny");
await as("authenticated", C, "insert into profiles (user_id, role, display_name) values ('" + C + "', 'organizador', 'x')", "NO se hace organizador (ya tiene perfil / rol)", "deny");

console.log(failures ? `\n${failures} comprobación(es) FALLARON` : "\nTodas las comprobaciones de permisos pasan");
process.exit(failures ? 1 : 0);
