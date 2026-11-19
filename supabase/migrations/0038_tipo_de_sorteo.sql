-- Tipo de sorteo del evento y paquetes de tiros de Lazada Sorteada (KIN-648, KIN-649). Solo cambios aditivos, más el reemplazo de
-- register_for_event, organizer_enroll y app_organizer_events.
--
-- Decisiones (KIN-648, 2026-11-19):
--  * Tipos válidos hoy: `round_robin` y `lazada_sorteada`, ambos de eventos casuales. Los eventos que ya existían quedan en `round_robin`.
--  * El tipo lo fija quien crea el evento (la web o la app, que lo sube) y NO se puede cambiar cuando ya hay inscritos o resultados.
--    Lo mismo vale para los tiros por paquete, porque cambian lo que significa cada paquete ya comprado.
--  * Lazada Sorteada: el organizador define cuántos tiros trae un paquete (`lazada_shots_per_package`, uno por evento) y cada inscripción
--    guarda cuántos paquetes compró esa persona en ese rol (`registrations.packages`). Tiros = paquetes * tiros por paquete (lo calcula la app).
--    El monto de la inscripción es costo de la categoría * paquetes. Los paquetes no ocupan más lugares del cupo: el cupo cuenta inscripciones.
--  * `max_team_rating` es el rating máximo de la SUMA de un equipo (cabecero + pialador). En Lazada Sorteada la app lo usa como restricción
--    dura al sortear; aquí solo se guarda y viaja. Es independiente de `max_roper_rating` (el individual, KIN-638).

alter table public.events add column if not exists draw_type text not null default 'round_robin'
  check (draw_type in ('round_robin', 'lazada_sorteada'));
alter table public.events add column if not exists lazada_shots_per_package integer
  check (lazada_shots_per_package is null or (lazada_shots_per_package >= 1 and lazada_shots_per_package <= 999));
alter table public.events add column if not exists max_team_rating numeric(3,1)
  check (max_team_rating is null or (max_team_rating >= 0 and max_team_rating <= 20));
-- Los tiros por paquete solo tienen sentido en Lazada Sorteada.
alter table public.events drop constraint if exists events_shots_only_lazada;
alter table public.events add constraint events_shots_only_lazada
  check (lazada_shots_per_package is null or draw_type = 'lazada_sorteada');

grant insert (draw_type, lazada_shots_per_package, max_team_rating) on public.events to authenticated;
grant update (draw_type, lazada_shots_per_package, max_team_rating) on public.events to authenticated;

alter table public.registrations add column if not exists packages integer not null default 1
  check (packages >= 1 and packages <= 99);

-- No cambiar el tipo de sorteo ni los tiros por paquete con inscritos o resultados. También vale para la service role (la subida de la app).
create or replace function private.lock_draw_type() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.draw_type is distinct from old.draw_type or new.lazada_shots_per_package is distinct from old.lazada_shots_per_package then
    if exists (select 1 from public.registrations where event_id = old.id)
       or exists (select 1 from public.event_results where event_id = old.id) then
      raise exception 'draw_type_locked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.lock_draw_type() from public, anon, authenticated;
drop trigger if exists events_lock_draw_type on public.events;
create trigger events_lock_draw_type before update on public.events
  for each row execute function private.lock_draw_type();

-- Paquetes válidos para un evento: 1 en cualquier tipo; 2 a 99 solo en Lazada Sorteada. Lanza invalid_packages.
create or replace function private.check_packages(p_draw_type text, p_packages integer) returns integer
  language plpgsql immutable set search_path = ''
  as $$
begin
  if p_packages is null or p_packages < 1 or p_packages > 99 then raise exception 'invalid_packages' using errcode = 'P0001'; end if;
  if p_packages > 1 and p_draw_type <> 'lazada_sorteada' then raise exception 'invalid_packages' using errcode = 'P0001'; end if;
  return p_packages;
end $$;

-- Inscribirse a un evento, con rol y paquetes. Igual que la de la 0034, y el monto es costo * paquetes.
create or replace function private.register_for_event(p_event uuid, p_category uuid, p_role text, p_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[]; r text; first_reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  perform private.check_packages(ev.draw_type, p_packages);
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then
    raise exception 'not_open_yet' using errcode = 'P0001';
  end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
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
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n + cardinality(roles) > ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
      values (p_event, rid, p_category, fee * p_packages, r, p_packages) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;
revoke all on function private.register_for_event(uuid, uuid, text, integer) from public, anon;
grant execute on function private.register_for_event(uuid, uuid, text, integer) to authenticated;

create or replace function public.register_for_event(p_event uuid, p_category uuid, p_role text, p_packages integer) returns uuid
  language sql set search_path = '' as $$ select private.register_for_event(p_event, p_category, p_role, p_packages) $$;
revoke all on function public.register_for_event(uuid, uuid, text, integer) from public, anon;
grant execute on function public.register_for_event(uuid, uuid, text, integer) to authenticated;

-- La versión de tres argumentos queda como envoltorio de un paquete.
create or replace function private.register_for_event(p_event uuid, p_category uuid, p_role text) returns uuid
  language sql security definer set search_path = '' as $$ select private.register_for_event(p_event, p_category, p_role, 1) $$;

-- El organizador inscribe (por correo) con rol y paquetes. Igual que la de la 0034, y el monto es costo * paquetes.
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
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n + cardinality(roles) > ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;
  foreach r in array roles loop
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
      values (p_event, rid, p_category, fee * p_packages, r, p_packages) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;
revoke all on function private.organizer_enroll(uuid, text, uuid, text, integer) from public, anon;
grant execute on function private.organizer_enroll(uuid, text, uuid, text, integer) to authenticated;
create or replace function public.organizer_enroll(p_event uuid, p_email text, p_category uuid, p_role text, p_packages integer) returns uuid
  language sql set search_path = '' as $$ select private.organizer_enroll(p_event, p_email, p_category, p_role, p_packages) $$;
revoke all on function public.organizer_enroll(uuid, text, uuid, text, integer) from public, anon;
grant execute on function public.organizer_enroll(uuid, text, uuid, text, integer) to authenticated;

-- La versión de cuatro argumentos queda como envoltorio de un paquete.
create or replace function private.organizer_enroll(p_event uuid, p_email text, p_category uuid, p_role text) returns uuid
  language sql security definer set search_path = '' as $$ select private.organizer_enroll(p_event, p_email, p_category, p_role, 1) $$;

-- Eventos para la app (KIN-585): igual que la 0034, y cada inscripción lleva `packages` (paquetes de tiros; 1 fuera de Lazada Sorteada).
create or replace function public.app_organizer_events(
  p_organizer uuid,
  p_since timestamptz,
  p_snapshot timestamptz,
  p_after_changed timestamptz,
  p_after_id uuid,
  p_limit integer
) returns table (
  id uuid,
  slug text,
  name text,
  event_date date,
  city text,
  venue text,
  description text,
  disciplines text[],
  capacity integer,
  status text,
  changed_at timestamptz,
  categories jsonb,
  registrations jsonb
) language sql stable security definer set search_path = '' as $$
  with mine as (
    select
      e.id, e.slug, e.name, e.event_date, e.city, e.venue, e.description, e.disciplines, e.capacity, e.status,
      greatest(e.updated_at, coalesce((
        select max(ro.updated_at)
        from public.registrations r join public.ropers ro on ro.id = r.roper_id
        where r.event_id = e.id
      ), e.updated_at)) as changed_at
    from public.events e
    where e.organizer_id = p_organizer and e.status in ('publicado', 'finalizado')
  )
  select
    m.id, m.slug, m.name, m.event_date, m.city, m.venue, m.description, m.disciplines, m.capacity, m.status, m.changed_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'fee_cents', k.fee_cents) order by k.name, k.id)
      from public.event_categories k where k.event_id = m.id
    ), '[]'::jsonb) as categories,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'roper_global_id', coalesce(ro.merged_into, ro.id),
        'name', coalesce(canon.full_name, ro.full_name),
        'category_id', r.category_id,
        'category', k.name,
        'payment_status', r.payment_status,
        'amount_cents', r.amount_cents,
        'payment_method', r.payment_method,
        'role', r.role,
        'packages', r.packages
      ) order by r.created_at, r.id)
      from public.registrations r
      join public.ropers ro on ro.id = r.roper_id
      left join public.ropers canon on canon.id = ro.merged_into
      left join public.event_categories k on k.id = r.category_id
      where r.event_id = m.id
    ), '[]'::jsonb) as registrations
  from mine m
  where m.changed_at <= p_snapshot
    and (p_since is null or m.changed_at >= p_since)
    and (p_after_changed is null or (m.changed_at, m.id) > (p_after_changed, p_after_id))
  order by m.changed_at, m.id
  limit greatest(1, least(coalesce(p_limit, 50), 201))
$$;
revoke all on function public.app_organizer_events(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.app_organizer_events(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) to service_role;
