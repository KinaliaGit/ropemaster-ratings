-- Rol del lazador (KIN-622): con qué rol compite (cabecero, pialador o ambos y, si son ambos, cuál es su favorito). Solo cambios aditivos,
-- más el reemplazo de claim_my_roper y de app_event_participants (que ahora devuelve el rol).
--
-- Decisiones:
--  * Se guarda en `ropers` (el perfil de lazador, público): `primary_role` = header | heeler | both y `favorite_role` = header | heeler.
--    Los valores son los mismos `header` / `heeler` que ya usa el contrato con la app (sustituciones).
--  * Si es `both`, el favorito es obligatorio; si es header o heeler, el favorito va vacío. Un perfil sin rol (todos los existentes) tiene ambos en null
--    ("sin definir"): se les pide elegirlo en Mi cuenta, sin bloquearlos.
--  * El dueño cambia su rol con un UPDATE normal (la política "dueño cambia su foto" de la 0009 ya limita la fila al propio perfil); el
--    check de abajo garantiza que las dos columnas queden coherentes. El rol es público (se ve en el perfil), igual que el nombre.
--  * Al crear la cuenta, el rol viaja en los metadatos del registro y se guarda al crear el perfil (claim_my_roper con rol). Si un organizador
--    ya había registrado a esa persona por correo, al reclamar ese perfil se guarda el rol elegido.

alter table public.ropers
  add column if not exists primary_role text check (primary_role in ('header', 'heeler', 'both')),
  add column if not exists favorite_role text check (favorite_role in ('header', 'heeler'));
alter table public.ropers drop constraint if exists ropers_role_coherent;
alter table public.ropers add constraint ropers_role_coherent check (
  (primary_role is null and favorite_role is null)
  or (primary_role in ('header', 'heeler') and favorite_role is null)
  or (primary_role = 'both' and favorite_role is not null)
);

grant select (primary_role, favorite_role) on public.ropers to anon, authenticated;
grant update (primary_role, favorite_role) on public.ropers to authenticated;

-- Reclamar o crear el perfil de lazador, ahora con rol. La versión de un solo argumento (0016) queda como envoltorio sin rol.
create or replace function private.claim_roper(p_name text, p_role text, p_favorite text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); mail text; rid uuid;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role is not null and (
       p_role not in ('header', 'heeler', 'both')
       or (p_role = 'both' and coalesce(p_favorite, '') not in ('header', 'heeler'))
       or (p_role <> 'both' and p_favorite is not null)) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if p_role is null and p_favorite is not null then raise exception 'invalid_role' using errcode = '22023'; end if;
  select id into rid from public.ropers where user_id = uid;
  if rid is not null then return rid; end if;   -- ya tiene perfil: no se le cambia el rol aquí (eso se hace desde Mi cuenta)
  select lower(email) into mail from auth.users where id = uid and email_confirmed_at is not null;
  if mail is null then raise exception 'email_not_confirmed' using errcode = '42501'; end if;
  select r.id into rid from public.roper_contacts c join public.ropers r on r.id = c.roper_id
    where c.email = mail and r.user_id is null and r.merged_into is null for update of r;
  if rid is not null then
    update public.ropers set user_id = uid, primary_role = coalesce(p_role, primary_role), favorite_role = case when p_role is null then favorite_role else p_favorite end where id = rid;
    update public.roper_contacts set claimed = true where roper_id = rid;
    return rid;
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = '22023'; end if;
  insert into public.ropers (full_name, user_id, primary_role, favorite_role) values (btrim(p_name), uid, p_role, p_favorite) returning id into rid;
  insert into public.roper_contacts (roper_id, email, claimed) values (rid, mail, true) on conflict do nothing;
  return rid;
end $$;
revoke all on function private.claim_roper(text, text, text) from public, anon;
grant execute on function private.claim_roper(text, text, text) to authenticated;

create or replace function private.claim_roper(p_name text) returns uuid
  language sql security definer set search_path = '' as $$ select private.claim_roper(p_name, null, null) $$;

create or replace function public.claim_my_roper(p_name text, p_role text, p_favorite text) returns uuid
  language sql set search_path = '' as $$ select private.claim_roper(p_name, p_role, p_favorite) $$;
revoke all on function public.claim_my_roper(text, text, text) from public, anon;
grant execute on function public.claim_my_roper(text, text, text) to authenticated;

-- Participantes de un evento para la app (KIN-586): igual que la 0020, más `role` y `favorite_role`. Cambia el tipo de lo que devuelve,
-- por eso se borra y se vuelve a crear. Cambiar el rol toca ropers.updated_at, así que cuenta como cambio para la sincronización incremental.
drop function if exists public.app_event_participants(uuid, timestamptz, timestamptz, timestamptz, uuid, integer);
create function public.app_event_participants(
  p_event uuid,
  p_since timestamptz,
  p_snapshot timestamptz,
  p_after_changed timestamptz,
  p_after_id uuid,
  p_limit integer
) returns table (
  global_id uuid,
  name text,
  email text,
  claimed boolean,
  changed_at timestamptz,
  ratings jsonb,
  role text,
  favorite_role text
) language sql stable security definer set search_path = '' as $$
  with registered as (
    select r.roper_id, max(r.created_at) as registered_at
    from public.registrations r
    where r.event_id = p_event
    group by r.roper_id
  ), people as (
    select
      ro.id as global_id,
      ro.full_name as name,
      rc.email,
      coalesce(rc.claimed, false) as claimed,
      greatest(ro.updated_at, g.registered_at, coalesce(rc.updated_at, ro.updated_at), coalesce(rt.last_rated_at, ro.updated_at)) as changed_at,
      coalesce(rt.ratings, '{}'::jsonb) as ratings,
      ro.primary_role as role,
      ro.favorite_role
    from registered g
    join public.ropers ro on ro.id = g.roper_id and ro.merged_into is null
    left join public.roper_contacts rc on rc.roper_id = ro.id
    left join lateral (
      select
        max(x.updated_at) as last_rated_at,
        jsonb_object_agg(x.discipline, jsonb_build_object(
          'rating', x.rating, 'events', x.events_count, 'wins', x.wins, 'updated_at', x.updated_at
        )) as ratings
      from public.roper_ratings x
      where x.roper_id = ro.id
    ) rt on true
  )
  select p.global_id, p.name, p.email, p.claimed, p.changed_at, p.ratings, p.role, p.favorite_role
  from people p
  where p.changed_at <= p_snapshot
    and (p_since is null or p.changed_at >= p_since)
    and (p_after_changed is null or (p.changed_at, p.global_id) > (p_after_changed, p_after_id))
  order by p.changed_at, p.global_id
  limit greatest(1, least(coalesce(p_limit, 200), 501))
$$;
revoke all on function public.app_event_participants(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.app_event_participants(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) to service_role;
