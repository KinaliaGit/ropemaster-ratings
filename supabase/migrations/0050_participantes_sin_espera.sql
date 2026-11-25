-- Participantes de un evento para la app: SOLO quien está inscrito (corrige la 0049, KIN-726).
--
-- La 0049 hizo que `app_event_participants` devolviera también a quienes están en la lista de espera. Es un error: la app
-- baja a todos los participantes de un evento y los mete a su roster (`record_event_members` + `add_web_registrants_to_roster`),
-- así que una app ya instalada habría inscrito a quien solo espera lugar. La lista de espera ya viaja aparte, en `waitlist[]` de
-- `GET /api/app/eventos`, con nombre y rol, y no necesita estar aquí.
--
-- Esta función vuelve a la definición de la 0032 (mismo tipo de retorno, por eso basta `create or replace`). Quien pasa de
-- espera a inscrito ya tiene una inscripción, así que aparece aquí desde ese momento.

create or replace function public.app_event_participants(
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
