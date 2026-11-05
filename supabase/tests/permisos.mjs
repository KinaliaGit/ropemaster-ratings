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
}

console.log(failures ? `\n${failures} comprobación(es) FALLARON` : "\nTodas las comprobaciones de permisos pasan");
process.exit(failures ? 1 : 0);
