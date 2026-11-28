-- Cambiar el rol de una inscripción: ahora lo puede hacer cualquier inscrito, y la web sabe si el lado de destino tiene lugar.
-- Cambios (solo funciones; no toca tablas ni datos):
--  * `private.change_registration_role` deja de exigir que el PERFIL sea "Ambos". Quien tiene un solo rol también puede pasar una inscripción de cabecero a pialador (y al revés),
--    porque el rol vive en cada inscripción (0034) y el perfil no cambia. Se conservan TODAS las demás reglas: ser la persona inscrita, evento publicado, inscripciones abiertas,
--    no repetir un rol que ya tiene en esa categoría (`already`) y lugar en el lado de destino (`full`, el mismo `private.has_room` de 0062).
--  * `public.events_role_room(p_events)`: para cada evento publicado que quien consulta puede ver, dice si cabe una inscripción en cada lado ('header', 'heeler'). Solo devuelve sí o no
--    por lado (no cuántos hay ni quiénes), así la web oculta el botón de cambiar de rol cuando el lado de destino está lleno. Pide sesión; anónimo no la llama.
-- Se puede ejecutar más de una vez sin efecto extra.

create or replace function private.change_registration_role(p_registration uuid, p_role text) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare rid uuid := (select private.current_roper_id()); reg record;
begin
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('header', 'heeler') then raise exception 'invalid_role' using errcode = 'P0001'; end if;
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
  -- Mover la inscripción a otro lado ocupa un lugar de ese lado (el total no cambia). Se bloquea el evento para que dos cambios a la vez no rebasen el tope.
  perform 1 from public.events where id = reg.event_id for update;
  if not private.has_room(reg.event_id, array[p_role], true) then raise exception 'full' using errcode = 'P0001'; end if;
  update public.registrations set role = p_role where id = p_registration;
end $$;

-- ¿Cabe una inscripción más en cada lado? Hasta 50 eventos por llamada. Solo eventos publicados que quien consulta puede ver (los privados y borradores no se filtran).
create or replace function private.events_role_room(p_events uuid[]) returns table(event_id uuid, side text, has_room boolean)
  language sql stable security definer set search_path = ''
  as $$
  select e.id, s.side, private.has_room(e.id, array[s.side], true)
  from public.events e
  cross join (values ('header'), ('heeler')) as s(side)
  where e.id = any (p_events[1:50]) and e.status = 'publicado' and public.can_view_event(e.organizer_id, e.status, e.visibility, e.id)
$$;
revoke all on function private.events_role_room(uuid[]) from public, anon;
grant execute on function private.events_role_room(uuid[]) to authenticated;

create or replace function public.events_role_room(p_events uuid[]) returns table(event_id uuid, side text, has_room boolean)
  language sql stable set search_path = ''
  as $$ select * from private.events_role_room(p_events) $$;
revoke all on function public.events_role_room(uuid[]) from public, anon;
grant execute on function public.events_role_room(uuid[]) to authenticated;
