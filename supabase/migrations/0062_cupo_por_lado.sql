-- Cupo por lado (KIN-775). Cambios aditivos (dos columnas nuevas, opcionales) y el chequeo de cupo de las funciones de inscripción y de lista de espera reescrito en UN solo lugar.
--
-- Decisiones (2026-11-27):
--  * `events.capacity` sigue siendo el cupo TOTAL del evento y sigue contando inscripciones (con el rol "los dos" cada lado ocupa un lugar). Vacío (`null`) = sin límite, como los
--    eventos que llegan de la app. Los eventos que ya existían quedan exactamente igual.
--  * Dos columnas nuevas, opcionales: `capacity_headers` (cabeceros) y `capacity_heelers` (pialadores). `null` = ese lado no tiene tope propio. Cada una va de 0 hasta el total
--    (cupo 0 = nadie de ese lado). El formulario las llena con "igual por lado" o "por lado" y guarda como total la suma, así el total y los lados nunca se contradicen.
--  * UNA sola regla de cupo: `private.has_room(evento, roles)`. Dice si caben esas inscripciones: el total (si hay) Y el tope de cada lado que se pide (si hay). Un lado lleno manda a
--    la lista de espera aunque el otro tenga lugar. Las inscripciones sin rol cuentan solo en el total.
--  * Las siete funciones que aplicaban el cupo con su propia cuenta (inscribirse, inscribirse por lado, inscribir el organizador, entrar a la lista de espera, entrar por lado,
--    pasar a alguien de la espera a inscrito y cambiar el rol de una inscripción) ahora preguntan a `has_room`. Mismos nombres, firmas, errores y permisos; solo cambia cómo cuentan.
--    Pasar de espera a inscrito revisa el lado de esa persona; cambiar de rol revisa el lado de destino (el total no cambia) y bloquea el evento.
--  * La lista de espera sigue siendo la misma tabla y el mismo orden de llegada; el lugar en la fila (`my_waitlist`) y lo que ve la app no cambian.
-- Se puede ejecutar más de una vez sin efecto extra.

alter table public.events add column if not exists capacity_headers integer check (capacity_headers is null or capacity_headers >= 0);
alter table public.events add column if not exists capacity_heelers integer check (capacity_heelers is null or capacity_heelers >= 0);
alter table public.events drop constraint if exists events_capacity_sides_check;
alter table public.events add constraint events_capacity_sides_check check (
  capacity is null or ((capacity_headers is null or capacity_headers <= capacity) and (capacity_heelers is null or capacity_heelers <= capacity))
);
grant insert (capacity_headers, capacity_heelers) on public.events to authenticated;
grant update (capacity_headers, capacity_heelers) on public.events to authenticated;

-- ¿Caben estas inscripciones? `p_roles` trae el rol de cada inscripción nueva ('header', 'heeler' o null si no tiene rol; el mismo arreglo que arman las funciones de inscripción).
-- `p_move` = true cuando las inscripciones ya existen y solo cambian de lado (el total no cambia: se revisa únicamente el tope del lado de destino).
-- Quien la llama ya tiene bloqueada la fila del evento (for update), así que dos inscripciones a la vez no rebasan el cupo.
create or replace function private.has_room(p_event uuid, p_roles text[], p_move boolean default false) returns boolean
  language plpgsql stable security definer set search_path = ''
  as $$
declare ev record; r text; cap integer; n integer;
begin
  select capacity, capacity_headers, capacity_heelers into ev from public.events where id = p_event;
  if not found then return false; end if;
  if not p_move and ev.capacity is not null then
    select count(*) into n from public.registrations where event_id = p_event;
    if n + cardinality(p_roles) > ev.capacity then return false; end if;
  end if;
  foreach r in array p_roles loop
    cap := case r when 'header' then ev.capacity_headers when 'heeler' then ev.capacity_heelers else null end;
    if cap is not null then
      select count(*) into n from public.registrations where event_id = p_event and role = r;
      if n + (select count(*) from unnest(p_roles) as x where x = r) > cap then return false; end if;
    end if;
  end loop;
  return true;
end $$;
revoke all on function private.has_room(uuid, text[], boolean) from public, anon, authenticated;

-- register_for_event: mismo cuerpo de su versión vigente; el cupo se pregunta a private.has_room.
create or replace function private.register_for_event(p_event uuid, p_category uuid, p_role text, p_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[]; r text; first_reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  perform private.check_packages(ev.draw_type, p_packages);
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then
    raise exception 'not_open_yet' using errcode = 'P0001';
  end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  -- KIN-656: un evento cuya fecha ya pasó (en SU zona horaria) deja de aceptar inscripciones aunque nadie lo haya cerrado.
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  roles := private.roles_for_registration(rid, p_role, false);
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[])) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  if not private.has_room(p_event, roles) then raise exception 'full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
      values (p_event, rid, p_category, fee * p_packages, r, p_packages) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;

-- register_for_event_by_side: mismo cuerpo de su versión vigente; el cupo se pregunta a private.has_room.
create or replace function private.register_for_event_by_side(p_event uuid, p_category uuid, p_header_packages integer, p_heeler_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[] := array[]::text[]; r text; pk integer; first_reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores), con cualquier rol en el perfil
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev
    from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  if ev.draw_type <> 'lazada_sorteada'
     or p_header_packages is null or p_heeler_packages is null
     or p_header_packages < 0 or p_header_packages > 99 or p_heeler_packages < 0 or p_heeler_packages > 99
     or p_header_packages + p_heeler_packages < 1 then
    raise exception 'invalid_packages' using errcode = 'P0001';
  end if;
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then raise exception 'not_open_yet' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then raise exception 'registration_closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if p_header_packages > 0 then roles := array_append(roles, 'header'::text); end if;
  if p_heeler_packages > 0 then roles := array_append(roles, 'heeler'::text); end if;
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category and (role is null or role = any (roles))) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  if not private.has_room(p_event, roles) then raise exception 'full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    pk := case r when 'header' then p_header_packages else p_heeler_packages end;
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
      values (p_event, rid, p_category, fee * pk, r, pk) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;

-- organizer_enroll: mismo cuerpo de su versión vigente; el cupo se pregunta a private.has_room.
create or replace function private.organizer_enroll(p_event uuid, p_email text, p_category uuid, p_role text, p_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[]; r text; first_reg uuid;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, capacity, draw_type into ev from public.events where id = p_event and organizer_id = uid and status = 'publicado' for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.check_packages(ev.draw_type, p_packages);
  select roper_id into rid from public.roper_contacts where lower(email) = lower(btrim(p_email));
  if rid is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  roles := private.roles_for_registration(rid, p_role, true);
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[])) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  if not private.has_room(p_event, roles) then raise exception 'full' using errcode = 'P0001'; end if;
  foreach r in array roles loop
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
      values (p_event, rid, p_category, fee * p_packages, r, p_packages) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;

-- join_waitlist: mismo cuerpo de su versión vigente; el cupo se pregunta a private.has_room.
create or replace function private.join_waitlist(p_event uuid, p_category uuid, p_role text, p_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; n integer; roles text[]; r text; entry uuid; first_entry uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev
    from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  perform private.check_packages(ev.draw_type, p_packages);
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then raise exception 'not_open_yet' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then raise exception 'registration_closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.event_categories where id = p_category and event_id = p_event) then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  roles := private.roles_for_registration(rid, p_role, false);
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[]))
     or exists (select 1 from public.event_waitlist where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[])) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  if private.has_room(p_event, roles) then raise exception 'not_full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    insert into public.event_waitlist (event_id, roper_id, category_id, role, packages) values (p_event, rid, p_category, r, p_packages) returning id into entry;
    first_entry := coalesce(first_entry, entry);
  end loop;
  return first_entry;
end $$;

-- join_waitlist_by_side: mismo cuerpo de su versión vigente; el cupo se pregunta a private.has_room.
create or replace function private.join_waitlist_by_side(p_event uuid, p_category uuid, p_header_packages integer, p_heeler_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; n integer; roles text[] := array[]::text[]; r text; pk integer; entry uuid; first_entry uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev
    from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  if ev.draw_type <> 'lazada_sorteada'
     or p_header_packages is null or p_heeler_packages is null
     or p_header_packages < 0 or p_header_packages > 99 or p_heeler_packages < 0 or p_heeler_packages > 99
     or p_header_packages + p_heeler_packages < 1 then
    raise exception 'invalid_packages' using errcode = 'P0001';
  end if;
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then raise exception 'not_open_yet' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then raise exception 'registration_closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.event_categories where id = p_category and event_id = p_event) then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if p_header_packages > 0 then roles := array_append(roles, 'header'::text); end if;
  if p_heeler_packages > 0 then roles := array_append(roles, 'heeler'::text); end if;
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category and (role is null or role = any (roles)))
     or exists (select 1 from public.event_waitlist where event_id = p_event and roper_id = rid and category_id = p_category and (role is null or role = any (roles))) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  if private.has_room(p_event, roles) then raise exception 'not_full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    pk := case r when 'header' then p_header_packages else p_heeler_packages end;
    insert into public.event_waitlist (event_id, roper_id, category_id, role, packages) values (p_event, rid, p_category, r, pk) returning id into entry;
    first_entry := coalesce(first_entry, entry);
  end loop;
  return first_entry;
end $$;

-- promote_waitlist_entry: mismo cuerpo de su versión vigente; el cupo se pregunta a private.has_room.
create or replace function private.promote_waitlist_entry(p_entry uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); is_admin boolean; w record; ev record; n integer; fee integer; reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  is_admin := exists (select 1 from public.admins a where a.user_id = uid);
  if not is_admin and not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select event_id into w from public.event_waitlist where id = p_entry;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select id, name, event_date, capacity, organizer_id, status, draw_type into ev from public.events where id = w.event_id for update;
  if ev.organizer_id <> uid and not is_admin then raise exception 'not_found' using errcode = 'P0002'; end if;
  select id, roper_id, category_id, role, packages into w from public.event_waitlist where id = p_entry for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if ev.status <> 'publicado' then raise exception 'closed' using errcode = 'P0001'; end if;
  if not private.has_room(ev.id, array[w.role]) then raise exception 'full' using errcode = 'P0001'; end if;
  select fee_cents into fee from public.event_categories where id = w.category_id and event_id = ev.id;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations where event_id = ev.id and roper_id = w.roper_id and category_id = w.category_id and role is not distinct from w.role) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
    values (ev.id, w.roper_id, w.category_id, fee * w.packages, w.role, w.packages) returning id into reg;
  insert into public.notifications (user_id, kind, event_id, event_name, event_date)
    select ro.user_id, 'promoted', ev.id, ev.name, ev.event_date from public.ropers ro where ro.id = w.roper_id and ro.user_id is not null;
  return reg;
end $$;

-- change_registration_role (0034): ahora también respeta el cupo del lado al que se mueve la inscripción.
create or replace function private.change_registration_role(p_registration uuid, p_role text) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare rid uuid := (select private.current_roper_id()); reg record; pr text;
begin
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('header', 'heeler') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  select primary_role into pr from public.ropers where id = rid;
  if pr is distinct from 'both' then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  select r.id, r.event_id, r.category_id, r.role, e.status, e.registration_closed, e.registration_closes_at into reg
    from public.registrations r join public.events e on e.id = r.event_id
    where r.id = p_registration and r.roper_id = rid for update of r;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if reg.status <> 'publicado' then raise exception 'closed' using errcode = 'P0001'; end if;
  if reg.registration_closed or (reg.registration_closes_at is not null and now() >= reg.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if reg.role = p_role then return; end if;
  if exists (select 1 from public.registrations where event_id = reg.event_id and roper_id = rid and category_id is not distinct from reg.category_id
             and id <> p_registration and (role is null or role = p_role)) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  -- Mover la inscripción a otro lado ocupa un lugar de ese lado (el total no cambia). Se bloquea el evento para que dos cambios a la vez no rebasen el tope.
  perform 1 from public.events where id = reg.event_id for update;
  if not private.has_room(reg.event_id, array[p_role], true) then raise exception 'full' using errcode = 'P0001'; end if;
  update public.registrations set role = p_role where id = p_registration;
end $$;
