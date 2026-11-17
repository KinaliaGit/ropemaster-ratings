-- Rol por inscripción (KIN-623): quien tiene el rol "Ambos" en su perfil elige, al inscribirse, con qué rol entra a ese evento
-- (cabecero, pialador o los dos). Solo cambios aditivos, más el reemplazo de register_for_event, organizer_enroll y app_organizer_events.
--
-- Decisiones:
--  * La inscripción guarda su propio rol (`registrations.role`: header | heeler); NO cambia el perfil. Quien tiene rol cabecero o pialador en su
--    perfil queda inscrito con ese rol sin elegir nada; quien aún no tiene rol ("sin definir", perfiles anteriores) queda con role = null.
--  * "Los dos" = DOS inscripciones (una de cabecero y otra de pialador), cada una con su lugar en el cupo y SU PROPIO COSTO (se cobran dos
--    inscripciones: son dos corridas distintas, una por rol). Es todo o nada: si no caben las dos en el cupo, no se crea ninguna.
--    Cada inscripción se paga y se cancela por separado (como las de dos categorías).
--  * El cupo del evento sigue siendo uno solo (events.capacity); cuenta inscripciones, así que "los dos" ocupa 2 lugares. No hay cupo por rol.
--  * Quien tiene "Ambos" tiene que elegir: la base rechaza (role_required) si no llega rol. El organizador, al inscribir a mano, puede omitirlo
--    y entonces se usa el favorito de esa persona.
--  * Cambiar el rol de una inscripción hecha: solo su dueño, solo si su perfil es "Ambos", y solo mientras las inscripciones sigan abiertas.
--  * La app recibe `role` en cada inscripción (header, heeler o null).

alter table public.registrations add column if not exists role text check (role in ('header', 'heeler'));

-- Antes: una inscripción por (evento, persona, categoría). Ahora puede haber una por rol dentro de la misma categoría.
alter table public.registrations drop constraint if exists registrations_event_id_roper_id_category_id_key;
create unique index if not exists registrations_event_roper_category_role_key
  on public.registrations (event_id, roper_id, category_id, (coalesce(role, '')));

-- Roles con los que entra una persona: un arreglo de 1 o 2 elementos (el null es "sin definir"). Lanza invalid_role / role_required.
create or replace function private.roles_for_registration(p_roper uuid, p_role text, p_default_favorite boolean) returns text[]
  language plpgsql stable set search_path = ''
  as $$
declare pr text; fav text;
begin
  select primary_role, favorite_role into pr, fav from public.ropers where id = p_roper;
  if p_role is not null and p_role not in ('header', 'heeler', 'both') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
  if pr is null then
    if p_role is not null then raise exception 'invalid_role' using errcode = 'P0001'; end if;
    return array[null]::text[];
  elsif pr <> 'both' then
    if p_role is not null and p_role <> pr then raise exception 'invalid_role' using errcode = 'P0001'; end if;
    return array[pr];
  end if;
  if p_role is null then
    if p_default_favorite then return array[fav]; end if;
    raise exception 'role_required' using errcode = 'P0001';
  end if;
  if p_role = 'both' then return array['header', 'heeler']; end if;
  return array[p_role];
end $$;

-- Inscribirse a un evento, con rol. Devuelve el id de la (primera) inscripción creada.
create or replace function private.register_for_event(p_event uuid, p_category uuid, p_role text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[]; r text; first_reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, registration_closed, registration_closes_at into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  roles := private.roles_for_registration(rid, p_role, false);
  -- Ya inscrito: en ese rol (una inscripción anterior sin rol cuenta como cualquier rol)
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[])) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n + cardinality(roles) > ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role) values (p_event, rid, p_category, fee, r) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;
revoke all on function private.register_for_event(uuid, uuid, text) from public, anon;
grant execute on function private.register_for_event(uuid, uuid, text) to authenticated;

create or replace function public.register_for_event(p_event uuid, p_category uuid, p_role text) returns uuid
  language sql set search_path = '' as $$ select private.register_for_event(p_event, p_category, p_role) $$;
revoke all on function public.register_for_event(uuid, uuid, text) from public, anon;
grant execute on function public.register_for_event(uuid, uuid, text) to authenticated;

-- La versión de dos argumentos (sin rol) sigue existiendo: sirve a quien no tiene "Ambos"; para "Ambos" responde role_required.
create or replace function private.register_for_event(p_event uuid, p_category uuid) returns uuid
  language sql security definer set search_path = '' as $$ select private.register_for_event(p_event, p_category, null::text) $$;

-- Cambiar el rol de una inscripción propia (solo con perfil "Ambos" y mientras las inscripciones sigan abiertas).
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
  update public.registrations set role = p_role where id = p_registration;
end $$;
revoke all on function private.change_registration_role(uuid, text) from public, anon;
grant execute on function private.change_registration_role(uuid, text) to authenticated;
create or replace function public.change_registration_role(p_registration uuid, p_role text) returns void
  language sql set search_path = '' as $$ select private.change_registration_role(p_registration, p_role) $$;
revoke all on function public.change_registration_role(uuid, text) from public, anon;
grant execute on function public.change_registration_role(uuid, text) to authenticated;

-- El organizador inscribe (por correo) con rol. Sin rol y con perfil "Ambos", se usa su favorito. Sigue ignorando la fecha límite.
create or replace function private.organizer_enroll(p_event uuid, p_email text, p_category uuid, p_role text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[]; r text; first_reg uuid;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, capacity into ev from public.events where id = p_event and organizer_id = uid and status = 'publicado' for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
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
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role) values (p_event, rid, p_category, fee, r) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;
revoke all on function private.organizer_enroll(uuid, text, uuid, text) from public, anon;
grant execute on function private.organizer_enroll(uuid, text, uuid, text) to authenticated;
create or replace function public.organizer_enroll(p_event uuid, p_email text, p_category uuid, p_role text) returns uuid
  language sql set search_path = '' as $$ select private.organizer_enroll(p_event, p_email, p_category, p_role) $$;
revoke all on function public.organizer_enroll(uuid, text, uuid, text) from public, anon;
grant execute on function public.organizer_enroll(uuid, text, uuid, text) to authenticated;

-- La versión de tres argumentos queda como envoltorio (sin rol).
create or replace function private.organizer_enroll(p_event uuid, p_email text, p_category uuid) returns uuid
  language sql security definer set search_path = '' as $$ select private.organizer_enroll(p_event, p_email, p_category, null::text) $$;

-- Eventos para la app (KIN-585): igual que la 0024, y cada inscripción lleva `role` (header, heeler o null).
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
        'role', r.role
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
