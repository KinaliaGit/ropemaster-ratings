-- Series de eventos (KIN-625): un organizador agrupa varios eventos (p. ej. 9 fechas en el año) y los crea de golpe, cada uno con su propia
-- apertura de inscripciones. Solo cambios aditivos, más el reemplazo de register_for_event (para respetar la apertura programada).
--
-- Decisiones:
--  * `event_series` guarda lo público de la serie (nombre, descripción, fechas de inicio y fin, zona horaria). `event_series_template` guarda la
--    PLANTILLA que se copia a cada evento nuevo (ciudad, sede, cupo, modalidades, categorías con su costo e instrucciones de pago). Va aparte
--    porque las instrucciones de pago solo las ve el dueño; la serie, en cambio, es pública si tiene algún evento visible.
--  * Un evento pertenece a una sola serie (`events.series_id`). Los eventos de una serie son eventos normales: se inscriben, se editan, tienen
--    resultados y ratings igual que los demás. Borrar la serie NO borra sus eventos: quedan sueltos.
--  * Fechas: los eventos de una serie deben caer dentro de [start_date, end_date] (la base lo exige; la web avisa antes). Si se cambia el rango de
--    la serie y deja fuera a un evento, se rechaza. Máximo 30 eventos por serie.
--  * Apertura de inscripciones (`events.registration_opens_at`): vacía = desde que el evento se publica; con fecha y hora = antes de ese instante
--    nadie se inscribe solo (`not_open_yet`) y se abre sola al llegar (no hay proceso que la abra: register_for_event compara contra now()).
--    Debe ser anterior al cierre y no puede caer después del día del evento. El organizador siempre puede inscribir a mano (organizer_enroll).
--  * Crear eventos de la serie es atómico: add_series_events crea todos o ninguno (evento, categorías e instrucciones de pago, copiados de la
--    plantilla). El estado inicial es borrador o publicado, a elección.
--  * Borrar un evento de la serie solo si no tiene inscritos ni sacados ni resultados y no está finalizado (delete_series_event).
--  * Contrato con la app de escritorio: no cambia en esta tarea. Las series quedan guardadas con ids estables (event_series.id, events.series_id)
--    para exponerlas más adelante sin cambiar el esquema.

alter table public.events
  add column if not exists registration_opens_at timestamptz;

-- ---- Series ----
create table if not exists public.event_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  organizer_name text,
  name text not null check (length(btrim(name)) between 2 and 120),
  description text not null default '' check (length(description) <= 1000),
  start_date date not null,
  end_date date not null,
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists event_series_organizer_idx on public.event_series (organizer_id);

alter table public.events add column if not exists series_id uuid references public.event_series(id) on delete set null;
create index if not exists events_series_idx on public.events (series_id, event_date);

create table if not exists public.event_series_template (
  series_id uuid primary key references public.event_series(id) on delete cascade,
  city text not null default '',
  venue text not null default '',
  capacity integer check (capacity is null or capacity > 0),
  disciplines text[] not null default '{}',
  categories jsonb not null default '[]' check (jsonb_typeof(categories) = 'array' and jsonb_array_length(categories) <= 20),
  payment_info text not null default '' check (length(payment_info) <= 1000)
);

alter table public.event_series enable row level security;
revoke all on public.event_series from anon, authenticated;
grant select on public.event_series to anon, authenticated;
grant insert (id, slug, organizer_id, organizer_name, name, description, start_date, end_date, timezone) on public.event_series to authenticated;
grant update (name, description, start_date, end_date, timezone, updated_at) on public.event_series to authenticated;
grant delete on public.event_series to authenticated;

-- Pública si tiene algún evento visible para quien pregunta (la subconsulta aplica la política de `events`); la del dueño, siempre.
drop policy if exists "series visibles" on public.event_series;
create policy "series visibles" on public.event_series for select
  using (
    organizer_id = (select auth.uid())
    or exists (select 1 from public.events e where e.series_id = event_series.id)
  );
drop policy if exists "organizador crea sus series" on public.event_series;
create policy "organizador crea sus series" on public.event_series for insert to authenticated
  with check (organizer_id = (select auth.uid()) and (select private.organizer_active()));
drop policy if exists "organizador edita sus series" on public.event_series;
create policy "organizador edita sus series" on public.event_series for update to authenticated
  using (organizer_id = (select auth.uid()) and (select private.organizer_active()))
  with check (organizer_id = (select auth.uid()) and (select private.organizer_active()));
drop policy if exists "organizador borra sus series" on public.event_series;
create policy "organizador borra sus series" on public.event_series for delete to authenticated
  using (organizer_id = (select auth.uid()) and (select private.organizer_active()));

alter table public.event_series_template enable row level security;
revoke all on public.event_series_template from anon, authenticated;
grant select, delete on public.event_series_template to authenticated;
grant insert (series_id, city, venue, capacity, disciplines, categories, payment_info) on public.event_series_template to authenticated;
grant update (city, venue, capacity, disciplines, categories, payment_info) on public.event_series_template to authenticated;
drop policy if exists "plantilla solo del dueño" on public.event_series_template;
create policy "plantilla solo del dueño" on public.event_series_template for all to authenticated
  using (exists (select 1 from public.event_series s where s.id = series_id and s.organizer_id = (select auth.uid())))
  with check ((select private.organizer_active()) and exists (select 1 from public.event_series s where s.id = series_id and s.organizer_id = (select auth.uid())));

-- Cambiar el rango de la serie no puede dejar fuera a un evento suyo.
create or replace function private.event_series_check_range() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and exists (
       select 1 from public.events e where e.series_id = new.id and e.event_date is not null and (e.event_date < new.start_date or e.event_date > new.end_date)) then
    raise exception 'events_outside_range' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists event_series_check_range on public.event_series;
create trigger event_series_check_range before insert or update on public.event_series
  for each row execute function private.event_series_check_range();

-- Reglas de un evento: apertura de inscripciones y pertenencia a la serie.
create or replace function private.events_check_series_and_opening() returns trigger
  language plpgsql set search_path = ''
  as $$
declare s record; n integer;
begin
  if new.registration_opens_at is not null then
    if new.registration_closes_at is not null and new.registration_opens_at >= new.registration_closes_at then
      raise exception 'open_after_close' using errcode = '22023';
    end if;
    if new.event_date is not null and (new.registration_opens_at at time zone new.timezone)::date > new.event_date then
      raise exception 'open_after_event' using errcode = '22023';
    end if;
  end if;
  if new.series_id is not null then
    select organizer_id, start_date, end_date into s from public.event_series where id = new.series_id;
    if not found or new.organizer_id is distinct from s.organizer_id then raise exception 'series_owner' using errcode = '42501'; end if;
    if new.event_date is null or new.event_date < s.start_date or new.event_date > s.end_date then
      raise exception 'outside_series' using errcode = '22023';
    end if;
    if tg_op = 'INSERT' then
      select count(*) into n from public.events where series_id = new.series_id;
      if n >= 30 then raise exception 'series_full' using errcode = 'P0001'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists events_check_series_and_opening on public.events;
create trigger events_check_series_and_opening before insert or update of series_id, event_date, timezone, registration_opens_at, registration_closes_at on public.events
  for each row execute function private.events_check_series_and_opening();

grant insert (registration_opens_at) on public.events to authenticated;
grant update (registration_opens_at) on public.events to authenticated;

-- Crear de golpe los eventos de una serie (todos o ninguno), copiando la plantilla.
-- p_events: [{ "id": uuid, "slug": text, "name": text, "date": "YYYY-MM-DD", "opens_at": timestamptz|null }, ...]
create or replace function private.add_series_events(p_series uuid, p_events jsonb, p_publish boolean) returns uuid[]
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); s record; tpl record; item jsonb; ids uuid[] := '{}'; eid uuid; ename text; cat jsonb;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, organizer_id, organizer_name, timezone into s from public.event_series where id = p_series for update;
  if not found or s.organizer_id <> uid then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 30 then
    raise exception 'invalid_events' using errcode = '22023';
  end if;
  select * into tpl from public.event_series_template where series_id = p_series;
  if not found or coalesce(tpl.city, '') = '' or coalesce(tpl.venue, '') = '' or tpl.capacity is null or cardinality(tpl.disciplines) = 0
     or jsonb_array_length(tpl.categories) = 0 then
    raise exception 'template_incomplete' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(p_events) loop
    eid := (item ->> 'id')::uuid;
    ename := btrim(coalesce(item ->> 'name', ''));
    if length(ename) < 1 or length(ename) > 120 or coalesce(item ->> 'slug', '') !~ '^[a-z0-9-]{3,60}$' then
      raise exception 'invalid_events' using errcode = '22023';
    end if;
    insert into public.events (id, slug, name, event_date, city, venue, description, disciplines, capacity, status, organizer_id, organizer_name,
                               timezone, registration_opens_at, series_id)
      values (eid, item ->> 'slug', ename, (item ->> 'date')::date, tpl.city, tpl.venue, '', tpl.disciplines, tpl.capacity,
              case when p_publish then 'publicado' else 'borrador' end, uid, s.organizer_name,
              s.timezone, nullif(item ->> 'opens_at', '')::timestamptz, p_series);
    for cat in select * from jsonb_array_elements(tpl.categories) loop
      insert into public.event_categories (event_id, name, fee_cents)
        values (eid, btrim(cat ->> 'name'), greatest(0, coalesce((cat ->> 'fee_cents')::integer, 0)));
    end loop;
    if btrim(tpl.payment_info) <> '' then
      insert into public.event_payment_info (event_id, instructions) values (eid, btrim(tpl.payment_info));
    end if;
    ids := ids || eid;
  end loop;
  return ids;
end $$;
revoke all on function private.add_series_events(uuid, jsonb, boolean) from public, anon;
grant execute on function private.add_series_events(uuid, jsonb, boolean) to authenticated;
create or replace function public.add_series_events(p_series uuid, p_events jsonb, p_publish boolean) returns uuid[]
  language sql set search_path = '' as $$ select private.add_series_events(p_series, p_events, p_publish) $$;
revoke all on function public.add_series_events(uuid, jsonb, boolean) from public, anon;
grant execute on function public.add_series_events(uuid, jsonb, boolean) to authenticated;

-- Borrar un evento de la serie: solo si no tiene inscritos, sacados ni resultados y no está finalizado.
create or replace function private.delete_series_event(p_event uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); ev record;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, organizer_id, status, series_id into ev from public.events where id = p_event for update;
  if not found or ev.organizer_id <> uid then raise exception 'not_found' using errcode = 'P0002'; end if;
  if ev.series_id is null then raise exception 'not_in_series' using errcode = 'P0001'; end if;
  if ev.status = 'finalizado' then raise exception 'closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations where event_id = p_event)
     or exists (select 1 from public.registration_removals where event_id = p_event) then
    raise exception 'has_registrations' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.event_results where event_id = p_event) then raise exception 'has_results' using errcode = 'P0001'; end if;
  delete from public.events where id = p_event;
end $$;
revoke all on function private.delete_series_event(uuid) from public, anon;
grant execute on function private.delete_series_event(uuid) to authenticated;
create or replace function public.delete_series_event(p_event uuid) returns void
  language sql set search_path = '' as $$ select private.delete_series_event(p_event) $$;
revoke all on function public.delete_series_event(uuid) from public, anon;
grant execute on function public.delete_series_event(uuid) to authenticated;

-- Inscribirse: igual que en la 0034 y, además, no antes de la apertura programada.
create or replace function private.register_for_event(p_event uuid, p_category uuid, p_role text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[]; r text; first_reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, registration_closed, registration_closes_at, registration_opens_at into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
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
