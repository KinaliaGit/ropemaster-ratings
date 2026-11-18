-- Fecha límite de inscripción por evento (KIN-626). Solo cambios aditivos, más el reemplazo de register_for_event.
--
-- Decisiones:
--  * `registration_closes_at` (timestamptz) es el instante exacto del cierre; `timezone` (IANA, por defecto America/Mexico_City) es la zona
--    del evento: con ella se captura y se muestra la fecha. Sin fecha (null) las inscripciones siguen abiertas hasta que el organizador las cierre.
--  * `registration_closed` es el cierre manual: cierra antes de tiempo y se puede reabrir. Si el organizador reabre después de la fecha límite,
--    la web borra la fecha (queda abierto hasta que él lo cierre o ponga otra fecha).
--  * La fecha de cierre no puede caer después del día del evento. El evento solo tiene fecha (sin hora de inicio), así que se permite cerrar el
--    mismo día del evento, y nunca un día posterior (la fecha se mide en la zona del evento).
--  * register_for_event rechaza con 'registration_closed' pasado el cierre (aunque llamen directo a la API). El organizador del evento puede
--    inscribir a alguien por su correo con organizer_enroll, que NO mira el cierre (sí el cupo y la categoría).

alter table public.events
  add column if not exists timezone text not null default 'America/Mexico_City',
  add column if not exists registration_closes_at timestamptz,
  add column if not exists registration_closed boolean not null default false;

create or replace function private.events_check_registration_close() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  if new.registration_closes_at is not null and new.event_date is not null
     and (new.registration_closes_at at time zone new.timezone)::date > new.event_date then
    raise exception 'close_after_event' using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists events_check_registration_close on public.events;
create trigger events_check_registration_close before insert or update of timezone, registration_closes_at, event_date on public.events
  for each row execute function private.events_check_registration_close();

grant insert (timezone, registration_closes_at) on public.events to authenticated;
grant update (timezone, registration_closes_at, registration_closed) on public.events to authenticated;

-- Inscribirse: igual que antes (0016) y, además, el cierre de inscripciones.
create or replace function private.register_for_event(p_event uuid, p_category uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, registration_closed, registration_closes_at into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n >= ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;

  insert into public.registrations (event_id, roper_id, category_id, amount_cents) values (p_event, rid, p_category, fee) returning id into reg;
  return reg;
end $$;

-- El organizador activo inscribe a un participante (por su correo) en un evento PROPIO, también después del cierre.
-- Respeta el cupo y la categoría; el precio sale de la categoría y la inscripción nace pendiente de pago.
create or replace function private.organizer_enroll(p_event uuid, p_email text, p_category uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, capacity into ev from public.events where id = p_event and organizer_id = uid and status = 'publicado' for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  select roper_id into rid from public.roper_contacts where lower(email) = lower(btrim(p_email));
  if rid is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n >= ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;

  insert into public.registrations (event_id, roper_id, category_id, amount_cents) values (p_event, rid, p_category, fee) returning id into reg;
  return reg;
end $$;
revoke all on function private.organizer_enroll(uuid, text, uuid) from public, anon;
grant execute on function private.organizer_enroll(uuid, text, uuid) to authenticated;
create or replace function public.organizer_enroll(p_event uuid, p_email text, p_category uuid) returns uuid
  language sql set search_path = '' as $$ select private.organizer_enroll(p_event, p_email, p_category) $$;
revoke all on function public.organizer_enroll(uuid, text, uuid) from public, anon;
grant execute on function public.organizer_enroll(uuid, text, uuid) to authenticated;
