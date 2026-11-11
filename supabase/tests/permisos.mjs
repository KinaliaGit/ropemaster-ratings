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
    badRounds(17, Array.from({ length: 21 }, (_, i) => round(i + 1, "completed", 8000))), badRounds(18, [round(1, "completed", 8000, { stage: "semifinal" })]),
    badRounds(19, "no es una lista"), badRounds(20, [42]), badRounds(21, [round(1, "completed", 8000)], { completed_runs: 2 }), badRounds(22, [round(1, "no_time")], { nt_count: 0 }),
    badRounds(23, [round(1, "completed", 8000)], { dq_count: 1 }), badRounds(24, [round(1, "completed", 8000, { time_ms: 8000.5 })]),
  ]);
  await check("rondas inválidas o contadores que no coinciden: cada una se rechaza como invalid_field", invalid.length === 14 && invalid.every((r) => r.r_status === "rejected" && r.r_code === "invalid_field" && r.r_retry === false));
  await check("lo rechazado no dejó nada guardado", (await count("select count(*)::int as n from event_results where id::text like 'a1c2e3f4-0000-4000-8000-0000000001%' and id::text > '" + rid(10) + "'")) === 0);
  const twenty = await upload(A, [withRounds(30, Array.from({ length: 20 }, (_, i) => round(i + 1, "completed", 8000 + i)))]);
  await check("20 rondas es el máximo permitido", twenty[0].r_status === "accepted" && (await stored(30)).completed_runs === 20);

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

  // --- el código manual y los equipos no se pisan
  await svc("select public.rotate_api_token($1, 'm1')", [T1]);
  await svc("select public.rotate_api_token($1, 'm2')", [T1]);
  await check("generar un código manual nuevo revoca solo el manual anterior, no los equipos", (await count(T1, "manual")) === 1 && (await count(T1, "login")) === 3
    && (await verify("m1")) === null && (await verify("m2")) === T1);
  await check("el código manual NO cuenta dentro de los 3 equipos", (await device(T1, "t1-d5")) === null);
  await check("crear equipos no revoca el código manual", (await verify("m2")) === T1);
  await check("tener varios equipos activos NO rompe la tarjeta del código manual (a lo más un manual activo)", (await count(T1, "manual")) === 1);
  let dupManual = false;
  try { await db.query(`insert into api_tokens (organizer_id, token_hash, kind) values ('${T1}', 'manual-dos', 'manual')`); } catch { dupManual = true; }
  await check("seguir permitido: un solo código manual activo por organizador", dupManual);

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
    JSON.stringify(Object.keys(regs[0]).sort()) === JSON.stringify(["amount_cents", "category", "category_id", "id", "name", "payment_method", "payment_status", "roper_global_id"]));
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

console.log(failures ? `\n${failures} comprobación(es) FALLARON` : "\nTodas las comprobaciones de permisos pasan");
process.exit(failures ? 1 : 0);
