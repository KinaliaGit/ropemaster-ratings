-- Inscripciones reales (KIN-581). La tabla `registrations` ya existe (0002); aquí se cierra su acceso y se agregan las funciones.
--  * Nadie escribe `registrations` directo: solo las funciones register_for_event / cancel_registration (SECURITY DEFINER, esquema private).
--  * Cupo seguro: register_for_event bloquea la fila del evento (FOR UPDATE), cuenta y recién entonces inserta; dos personas
--    no pueden tomar el último lugar a la vez. El cupo cuenta inscripciones (una persona en 2 categorías ocupa 2 lugares).
--  * El conteo y la lista pública salen de funciones que solo devuelven datos de eventos publicados (sin exponer la tabla).
-- Mientras no exista el pago (Stripe) la inscripción queda en `pendiente` y ocupa lugar.

revoke all on registrations from anon, authenticated;
grant select on registrations to authenticated;

create or replace function private.register_for_event(p_event uuid, p_category uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select r.id into rid from public.ropers r join public.profiles p on p.user_id = r.user_id
    where r.user_id = uid and p.role = 'participante';
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
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
revoke all on function private.register_for_event(uuid, uuid) from public, anon;
grant execute on function private.register_for_event(uuid, uuid) to authenticated;
create or replace function public.register_for_event(p_event uuid, p_category uuid) returns uuid
  language sql set search_path = '' as $$ select private.register_for_event(p_event, p_category) $$;
revoke all on function public.register_for_event(uuid, uuid) from public, anon;
grant execute on function public.register_for_event(uuid, uuid) to authenticated;

-- Cancelar la propia inscripción mientras no esté pagada (un reembolso es otro trámite).
create or replace function private.cancel_registration(p_registration uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare rid uuid := (select private.current_roper_id()); status text;
begin
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select payment_status into status from public.registrations where id = p_registration and roper_id = rid for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if status <> 'pendiente' then raise exception 'paid' using errcode = 'P0001'; end if;
  delete from public.registrations where id = p_registration;
end $$;
revoke all on function private.cancel_registration(uuid) from public, anon;
grant execute on function private.cancel_registration(uuid) to authenticated;
create or replace function public.cancel_registration(p_registration uuid) returns void
  language sql set search_path = '' as $$ select private.cancel_registration(p_registration) $$;
revoke all on function public.cancel_registration(uuid) from public, anon;
grant execute on function public.cancel_registration(uuid) to authenticated;

-- Lecturas públicas: solo eventos publicados o finalizados; solo números e ids de participantes públicos (sin pagos).
create or replace function public.event_registration_counts() returns table (event_id uuid, n integer)
  language sql stable security definer set search_path = ''
  as $$ select r.event_id, count(*)::integer from public.registrations r join public.events e on e.id = r.event_id
        where e.status in ('publicado', 'finalizado') group by r.event_id $$;
create or replace function public.event_registrants(p_event uuid) returns table (roper_id uuid, category_id uuid)
  language sql stable security definer set search_path = ''
  as $$ select r.roper_id, r.category_id from public.registrations r join public.events e on e.id = r.event_id
        join public.ropers p on p.id = r.roper_id and p.merged_into is null
        where r.event_id = p_event and e.status in ('publicado', 'finalizado') order by r.created_at $$;
revoke all on function public.event_registration_counts() from public;
revoke all on function public.event_registrants(uuid) from public;
grant execute on function public.event_registration_counts() to anon, authenticated;
grant execute on function public.event_registrants(uuid) to anon, authenticated;
