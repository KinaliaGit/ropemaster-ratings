-- Borrar eventos y series completos (KIN-660). Solo cambios aditivos: una tabla nueva y dos funciones nuevas.
--
-- Decisiones (documentadas aquí porque la issue pedía decidirlas):
--  * Orden, como en la app: primero se borran los eventos y después la serie. Una serie con eventos NO se borra (`has_events`); antes, borrarla
--    dejaba sus eventos sueltos y eso ya no pasa.
--  * Quién: SOLO el organizador activo dueño (ni siquiera un admin: es destructivo y lo decide quien organiza). La base lo valida, no solo la página.
--  * Resultados y rating: un evento con resultados (o ya finalizado) NO se puede borrar (`has_results` / `closed`). Así nunca se alteran ratings ya
--    publicados ni se deja resultados sin evento. Para corregir un evento cerrado existe «reabrir».
--  * Borrado físico con constancia: el evento y sus inscripciones se borran de verdad (se libera el cupo, desaparecen de listas y de la API de la
--    app), pero antes queda una fila en `deleted_events` (quién, cuándo, motivo, cuántos inscritos) para auditar o resolver disputas.
--    No se eligió borrado lógico porque obligaría a filtrar `deleted_at` en cada consulta de la web y de la API de la app; la constancia
--    cubre la auditoría sin ese riesgo.
--  * Motivo: obligatorio (10 a 500 caracteres) SOLO si el evento tiene inscritos. Sin inscritos no se pide motivo ni se avisa a nadie.
--  * Aviso a los inscritos: la función crea el aviso dentro de la web (kind = 'event_deleted', tabla de la 0040) para cada persona con cuenta y
--    devuelve a quién avisar por correo (el correo sale desde el servidor, después; si falla, el borrado y los avisos ya quedaron).
-- Se puede ejecutar más de una vez sin efecto extra.

create table if not exists public.deleted_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,                       -- sin FK: el evento ya no existe
  organizer_id uuid references auth.users(id) on delete set null,
  name text not null,
  event_date date,
  series_name text,
  enrolled_count integer not null default 0,
  reason text not null default '',
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_events_organizer_idx on public.deleted_events (organizer_id, deleted_at desc);
alter table public.deleted_events enable row level security;
revoke all on public.deleted_events from anon, authenticated;
grant select on public.deleted_events to authenticated;
drop policy if exists "constancia visible al organizador y a admins" on public.deleted_events;
create policy "constancia visible al organizador y a admins" on public.deleted_events for select to authenticated
  using (organizer_id = (select auth.uid()) or exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

-- Borra un evento (con su motivo si tenía inscritos). Devuelve a quién avisar por correo: [{roper_id, paid}] (uno por persona).
create or replace function private.delete_event(p_event uuid, p_reason text) returns jsonb
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); ev record; why text := btrim(coalesce(p_reason, '')); n integer; people jsonb;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select e.id, e.organizer_id, e.name, e.event_date, e.status, s.name as series_name into ev
    from public.events e left join public.event_series s on s.id = e.series_id where e.id = p_event for update of e;
  if not found or ev.organizer_id <> uid then raise exception 'not_found' using errcode = 'P0002'; end if;
  if ev.status = 'finalizado' then raise exception 'closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.event_results where event_id = p_event) then raise exception 'has_results' using errcode = 'P0001'; end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if n > 0 and length(why) not between 10 and 500 then raise exception 'invalid_reason' using errcode = '22023'; end if;
  if n = 0 then why := ''; end if;

  select coalesce(jsonb_agg(jsonb_build_object('roper_id', x.roper_id, 'paid', x.paid)), '[]'::jsonb) into people
    from (select roper_id, bool_or(payment_status = 'pagado') as paid from public.registrations where event_id = p_event group by roper_id) x;

  insert into public.notifications (user_id, kind, event_id, event_name, event_date, reason, refund_pending)
    select ro.user_id, 'event_deleted', null, ev.name, ev.event_date, why, x.paid
    from (select roper_id, bool_or(payment_status = 'pagado') as paid from public.registrations where event_id = p_event group by roper_id) x
    join public.ropers ro on ro.id = x.roper_id where ro.user_id is not null;
  insert into public.deleted_events (event_id, organizer_id, name, event_date, series_name, enrolled_count, reason, deleted_by)
    values (ev.id, ev.organizer_id, ev.name, ev.event_date, ev.series_name, n, why, uid);
  delete from public.events where id = p_event;
  return people;
end $$;
revoke all on function private.delete_event(uuid, text) from public, anon;
grant execute on function private.delete_event(uuid, text) to authenticated;
create or replace function public.delete_event(p_event uuid, p_reason text) returns jsonb
  language sql set search_path = '' as $$ select private.delete_event(p_event, p_reason) $$;
revoke all on function public.delete_event(uuid, text) from public, anon;
grant execute on function public.delete_event(uuid, text) to authenticated;

-- Borra una serie, solo cuando ya no tiene eventos.
create or replace function private.delete_series(p_series uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); owner uuid;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select organizer_id into owner from public.event_series where id = p_series for update;
  if not found or owner <> uid then raise exception 'not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.events where series_id = p_series) then raise exception 'has_events' using errcode = 'P0001'; end if;
  delete from public.event_series where id = p_series;
end $$;
revoke all on function private.delete_series(uuid) from public, anon;
grant execute on function private.delete_series(uuid) to authenticated;
create or replace function public.delete_series(p_series uuid) returns void
  language sql set search_path = '' as $$ select private.delete_series(p_series) $$;
revoke all on function public.delete_series(uuid) from public, anon;
grant execute on function public.delete_series(uuid) to authenticated;

-- Borrar una serie solo por delete_series (que exige que ya no tenga eventos): el DELETE directo a la tabla deja de estar permitido.
revoke delete on public.event_series from authenticated;
