-- Resumen de control del organizador (KIN-658). Solo agrega una función de lectura; no toca tablas ni permisos de tablas.
--  * Devuelve de UNA vez, en un jsonb, todo lo que el Overview necesita: próxima serie y su siguiente evento, inscritos del siguiente evento con
--    desglose por rol, pagos (pendientes y cobrados), estados de los eventos, actividad reciente y pendientes del organizador.
--  * Todo son conteos y sumas hechos en la base (nunca se traen listas completas) y solo de los eventos y series DEL organizador que llama
--    (auth.uid()); exige organizador activo. La fecha de "hoy" de cada evento se calcula en su propia zona horaria.
--  * Las listas (actividad y pendientes) traen como máximo 5 u 8 filas.
-- Se puede ejecutar más de una vez sin efecto extra.

create or replace function private.organizer_overview() returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); res jsonb;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  with ev as (
    select e.id, e.slug, e.name, e.event_date, e.status, e.capacity, e.series_id, e.registration_opens_at, e.registration_closes_at, e.registration_closed,
           (now() at time zone e.timezone)::date as today
    from public.events e where e.organizer_id = uid
  ),
  reg as (
    select r.event_id, count(*) as n,
           count(*) filter (where r.payment_status = 'pagado') as paid_n, count(*) filter (where r.payment_status = 'pendiente') as pend_n,
           coalesce(sum(r.amount_cents) filter (where r.payment_status = 'pagado'), 0) as paid_c,
           coalesce(sum(r.amount_cents) filter (where r.payment_status = 'pendiente'), 0) as pend_c
    from public.registrations r join ev on ev.id = r.event_id group by r.event_id
  ),
  nxt as (  -- el siguiente evento publicado (hoy o después)
    select ev.* from ev where ev.status = 'publicado' and ev.event_date >= ev.today order by ev.event_date, ev.id limit 1
  ),
  nxt_roles as (
    select count(*) filter (where p.header and not p.heeler) as only_header, count(*) filter (where p.heeler and not p.header) as only_heeler,
           count(*) filter (where p.header and p.heeler) as both_roles, count(*) filter (where not p.header and not p.heeler) as no_role
    from (select r.roper_id, bool_or(r.role = 'header') as header, bool_or(r.role = 'heeler') as heeler
          from public.registrations r join nxt on nxt.id = r.event_id group by r.roper_id) p
  ),
  ser as (  -- la próxima serie (la que está en curso o la más cercana que aún no termina)
    select s.id, s.slug, s.name, s.start_date, s.end_date from public.event_series s
    where s.organizer_id = uid and s.end_date >= (now() at time zone s.timezone)::date order by s.start_date, s.id limit 1
  ),
  ser_ev as (
    select ev.*, coalesce(reg.n, 0) as n from ev join ser on ser.id = ev.series_id left join reg on reg.event_id = ev.id
  ),
  ser_next as (
    select * from ser_ev where status <> 'finalizado' and event_date >= today order by event_date, id limit 1
  ),
  activity as (
    select kind, who, event_name, at from (
      select 'enrolled' as kind, ro.full_name as who, ev.name as event_name, r.created_at as at
        from public.registrations r join ev on ev.id = r.event_id join public.ropers ro on ro.id = r.roper_id
      union all
      select 'removed', ro.full_name, ev.name, x.removed_at
        from public.registration_removals x join ev on ev.id = x.event_id join public.ropers ro on ro.id = x.roper_id
    ) a order by at desc limit 8
  )
  select jsonb_build_object(
    'series', (select jsonb_build_object(
        'slug', ser.slug, 'name', ser.name, 'start_date', ser.start_date, 'end_date', ser.end_date,
        'events', (select count(*) from ser_ev), 'enrolled', (select coalesce(sum(n), 0) from ser_ev),
        'next_event', (select jsonb_build_object('slug', slug, 'name', name, 'date', event_date, 'days', event_date - today) from ser_next))
      from ser),
    'next_event', (select jsonb_build_object(
        'slug', nxt.slug, 'name', nxt.name, 'date', nxt.event_date, 'days', nxt.event_date - nxt.today, 'capacity', nxt.capacity,
        'enrolled', coalesce((select n from reg where reg.event_id = nxt.id), 0),
        'only_header', nr.only_header, 'only_heeler', nr.only_heeler, 'both_roles', nr.both_roles, 'no_role', nr.no_role)
      from nxt, nxt_roles nr),
    'payments', (select jsonb_build_object('pending', coalesce(sum(pend_n), 0), 'paid', coalesce(sum(paid_n), 0),
        'pending_cents', coalesce(sum(pend_c), 0), 'collected_cents', coalesce(sum(paid_c), 0)) from reg),
    'states', (select jsonb_build_object(
        'open', count(*) filter (where status = 'publicado' and event_date >= today and not registration_closed
                                  and (registration_opens_at is null or now() >= registration_opens_at)
                                  and (registration_closes_at is null or now() < registration_closes_at)),
        'scheduled', count(*) filter (where status = 'publicado' and not registration_closed and registration_opens_at is not null and now() < registration_opens_at),
        'finished', count(*) filter (where status = 'finalizado' or (status = 'publicado' and event_date < today)),
        'draft', count(*) filter (where status = 'borrador')) from ev),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'who', who, 'event', event_name, 'at', at) order by at desc) from activity), '[]'::jsonb),
    'todo', jsonb_build_object(
      'unpaid', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'count', t.pend_n)) from (
          select ev.slug, ev.name, reg.pend_n from ev join reg on reg.event_id = ev.id where reg.pend_n > 0 and ev.status <> 'borrador' order by reg.pend_n desc, ev.event_date limit 5) t), '[]'::jsonb),
      'no_results', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'date', t.event_date)) from (
          select ev.slug, ev.name, ev.event_date from ev
          where ev.status = 'publicado' and ev.event_date < ev.today and not exists (select 1 from public.event_results x where x.event_id = ev.id)
          order by ev.event_date desc limit 5) t), '[]'::jsonb),
      'no_opening', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'date', t.event_date)) from (
          select ev.slug, ev.name, ev.event_date from ev
          where ev.status <> 'finalizado' and ev.event_date >= ev.today and ev.registration_opens_at is null and ev.series_id is not null
          order by ev.event_date limit 5) t), '[]'::jsonb))
  ) into res;
  return res;
end $$;
revoke all on function private.organizer_overview() from public, anon;
grant execute on function private.organizer_overview() to authenticated;
create or replace function public.organizer_overview() returns jsonb
  language sql stable set search_path = '' as $$ select private.organizer_overview() $$;
revoke all on function public.organizer_overview() from public, anon;
grant execute on function public.organizer_overview() to authenticated;
