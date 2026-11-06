-- Eventos del organizador con sus inscritos y pagos para la app local (KIN-585). Solo cambios aditivos.
-- Solo la ejecuta el servidor (service role); la API comprueba antes que el código de conexión sea de un organizador activo.

-- 1. Cambiar una inscripción (inscribirse, pagar, cancelar) o una categoría (costo, nombre) cuenta como cambio del EVENTO para la
--    sincronización incremental (?since=). Sin esto un pago nuevo o una cancelación no harían que la app volviera a descargar el
--    evento, porque hasta ahora solo se movía `events.updated_at` al editar el propio evento. Un borrado también cuenta: por eso es un
--    trigger y no una columna en `registrations`. El evento se reenvía completo, con la lista vigente de inscritos.
create or replace function public.touch_event_of_child() returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if tg_op = 'DELETE' then target := old.event_id; else target := new.event_id; end if;
  update public.events set updated_at = now() where id = target;
  return null;
end $$;
revoke all on function public.touch_event_of_child() from public, anon, authenticated;

drop trigger if exists registrations_touch_event on public.registrations;
create trigger registrations_touch_event after insert or update or delete on public.registrations
  for each row execute function public.touch_event_of_child();
drop trigger if exists event_categories_touch_event on public.event_categories;
create trigger event_categories_touch_event after insert or update or delete on public.event_categories
  for each row execute function public.touch_event_of_child();

-- 2. Eventos `publicado` o `finalizado` de UN organizador cuyo último cambio está entre `p_since` (inclusive) y `p_snapshot`
--    (inclusive), en orden estable (changed_at, id) y paginados por cursor (`p_after_changed`, `p_after_id`).
--    `changed_at` es lo más reciente entre el evento (que ya recoge inscripciones y categorías, ver arriba) y el perfil de quien
--    está inscrito (un cambio de nombre). Los borradores nunca salen. Nunca incluye correo, celular ni ids de cuenta.
--    Si el perfil de un inscrito se fusionó con otro (merged_into), la inscripción apunta al perfil vigente, que es el que
--    `GET /api/app/participantes` entrega.
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
        'payment_method', r.payment_method
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

-- 3. Una sola vez, al aplicar esta migración: las inscripciones que ya existían NO movieron `events.updated_at` (el trigger de arriba
--    solo ve los cambios futuros). Una app con un `since` anterior a esta fecha no las volvería a descargar. Se marca como cambiados
--    los eventos publicados o finalizados que ya tienen inscritos, para que se reenvíen completos una sola vez. Los borradores no salen.
update public.events e set updated_at = now()
where e.status in ('publicado', 'finalizado') and exists (select 1 from public.registrations r where r.event_id = e.id);
