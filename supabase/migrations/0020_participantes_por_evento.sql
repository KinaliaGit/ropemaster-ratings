-- Participantes de UN evento para la app local (KIN-586). Solo cambios aditivos.
-- La sincronización es SIEMPRE por evento: esta función solo devuelve a las personas inscritas en el evento que se pide,
-- nunca el directorio completo. Solo la ejecuta el servidor (service role); la API comprueba antes que el código de conexión
-- sea de un organizador activo y que el evento sea suyo.

-- Cambiar el correo o el estado `claimed` de un contacto también cuenta como cambio del participante para la sincronización
-- incremental (hasta ahora solo se movía ropers.updated_at). Las filas existentes quedan con la fecha de esta migración: se
-- reenviarán una sola vez.
alter table roper_contacts add column if not exists updated_at timestamptz not null default now();
drop trigger if exists roper_contacts_touch on roper_contacts;
create trigger roper_contacts_touch before update on roper_contacts for each row execute function touch_updated_at();

-- Participantes inscritos en `p_event` cuyo último cambio está entre `p_since` (inclusive) y `p_snapshot` (inclusive), en orden
-- estable (changed_at, global_id) y paginados por cursor (`p_after_changed`, `p_after_id`). `changed_at` es lo más reciente entre
-- el perfil, su contacto, sus ratings y su inscripción. Quien tiene un perfil fusionado (merged_into) no se incluye.
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
  ratings jsonb
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
      coalesce(rt.ratings, '{}'::jsonb) as ratings
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
  select p.global_id, p.name, p.email, p.claimed, p.changed_at, p.ratings
  from people p
  where p.changed_at <= p_snapshot
    and (p_since is null or p.changed_at >= p_since)
    and (p_after_changed is null or (p.changed_at, p.global_id) > (p_after_changed, p_after_id))
  order by p.changed_at, p.global_id
  limit greatest(1, least(coalesce(p_limit, 200), 501))
$$;
revoke all on function public.app_event_participants(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.app_event_participants(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) to service_role;
