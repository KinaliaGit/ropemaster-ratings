-- Rol y paquetes por lado al inscribirse a Lazada Sorteada (KIN-793). Solo agrega dos funciones nuevas; no toca tablas, datos ni las funciones que ya
-- existen (register_for_event y join_waitlist siguen con sus firmas y su comportamiento, también para la app y para los demás tipos de sorteo).
--
-- Decisiones (KIN-643: el paquete es el mismo para los dos lados, mismos tiros y mismo precio):
--  * Quien se inscribe a un evento de Lazada Sorteada dice cuántos paquetes compra COMO CABECERO y cuántos COMO PIALADOR (por ejemplo 1 y 1, 2 y 0, o 0 y 3).
--    Cada lado con paquetes es UNA inscripción con su `role` y sus `packages`: la app ya recibe una inscripción por rol. Un lado en 0 no crea inscripción.
--    Tiene que haber al menos 1 paquete en total y cada lado va de 0 a 99. Un solo rol es "cabecero N y pialador 0" (o al revés).
--  * El rol se elige AL INSCRIBIRSE, sin importar el rol del perfil: quien tiene solo cabecero o solo pialador (o aún no define su rol) también puede
--    inscribirse de cualquiera de los dos lados o de los dos. La inscripción guarda su propio rol y NO cambia el perfil. (Las funciones de siempre
--    siguen exigiendo que el rol coincida con el perfil; esta regla es solo de estas funciones nuevas.)
--  * El monto de cada inscripción es el costo de la categoría * los paquetes DE ESE LADO (nunca lo manda el navegador); el total a pagar es la suma.
--  * Mismas reglas que inscribirse de siempre: evento publicado, ventana de inscripción, fecha, no estar sacado, categoría, no repetir (por rol) y cupo.
--    El cupo cuenta inscripciones, así que "uno de cada lado" ocupa 2 lugares y es todo o nada: si no caben, no se crea ninguna.
--  * Solo en Lazada Sorteada (`invalid_packages` en otro tipo de sorteo, donde los paquetes no existen y el rol sigue saliendo del perfil como hasta ahora).
--  * Lista de espera: la misma regla (solo si inscribirse hoy fallaría por cupo; `not_full` si hay lugar) y una fila de espera por lado con sus paquetes.
-- Se puede ejecutar más de una vez sin efecto extra.

-- Inscribirse con paquetes por lado. Devuelve el id de la (primera) inscripción creada.
create or replace function private.register_for_event_by_side(p_event uuid, p_category uuid, p_header_packages integer, p_heeler_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[] := array[]::text[]; r text; pk integer; first_reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores), con cualquier rol en el perfil
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev
    from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  if ev.draw_type <> 'lazada_sorteada'
     or p_header_packages is null or p_heeler_packages is null
     or p_header_packages < 0 or p_header_packages > 99 or p_heeler_packages < 0 or p_heeler_packages > 99
     or p_header_packages + p_heeler_packages < 1 then
    raise exception 'invalid_packages' using errcode = 'P0001';
  end if;
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then raise exception 'not_open_yet' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then raise exception 'registration_closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if p_header_packages > 0 then roles := array_append(roles, 'header'::text); end if;
  if p_heeler_packages > 0 then roles := array_append(roles, 'heeler'::text); end if;
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category and (role is null or role = any (roles))) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n + cardinality(roles) > ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    pk := case r when 'header' then p_header_packages else p_heeler_packages end;
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
      values (p_event, rid, p_category, fee * pk, r, pk) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;
revoke all on function private.register_for_event_by_side(uuid, uuid, integer, integer) from public, anon;
grant execute on function private.register_for_event_by_side(uuid, uuid, integer, integer) to authenticated;
create or replace function public.register_for_event_by_side(p_event uuid, p_category uuid, p_header_packages integer, p_heeler_packages integer) returns uuid
  language sql set search_path = '' as $$ select private.register_for_event_by_side(p_event, p_category, p_header_packages, p_heeler_packages) $$;
revoke all on function public.register_for_event_by_side(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.register_for_event_by_side(uuid, uuid, integer, integer) to authenticated;

-- Entrar a la lista de espera con paquetes por lado. Una fila de espera por lado con paquetes. Devuelve el id de la (primera) fila creada.
create or replace function private.join_waitlist_by_side(p_event uuid, p_category uuid, p_header_packages integer, p_heeler_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; n integer; roles text[] := array[]::text[]; r text; pk integer; entry uuid; first_entry uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev
    from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  if ev.draw_type <> 'lazada_sorteada'
     or p_header_packages is null or p_heeler_packages is null
     or p_header_packages < 0 or p_header_packages > 99 or p_heeler_packages < 0 or p_heeler_packages > 99
     or p_header_packages + p_heeler_packages < 1 then
    raise exception 'invalid_packages' using errcode = 'P0001';
  end if;
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then raise exception 'not_open_yet' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then raise exception 'registration_closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.event_categories where id = p_category and event_id = p_event) then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if p_header_packages > 0 then roles := array_append(roles, 'header'::text); end if;
  if p_heeler_packages > 0 then roles := array_append(roles, 'heeler'::text); end if;
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category and (role is null or role = any (roles)))
     or exists (select 1 from public.event_waitlist where event_id = p_event and roper_id = rid and category_id = p_category and (role is null or role = any (roles))) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is null or n + cardinality(roles) <= ev.capacity then raise exception 'not_full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    pk := case r when 'header' then p_header_packages else p_heeler_packages end;
    insert into public.event_waitlist (event_id, roper_id, category_id, role, packages) values (p_event, rid, p_category, r, pk) returning id into entry;
    first_entry := coalesce(first_entry, entry);
  end loop;
  return first_entry;
end $$;
revoke all on function private.join_waitlist_by_side(uuid, uuid, integer, integer) from public, anon;
grant execute on function private.join_waitlist_by_side(uuid, uuid, integer, integer) to authenticated;
create or replace function public.join_waitlist_by_side(p_event uuid, p_category uuid, p_header_packages integer, p_heeler_packages integer) returns uuid
  language sql set search_path = '' as $$ select private.join_waitlist_by_side(p_event, p_category, p_header_packages, p_heeler_packages) $$;
revoke all on function public.join_waitlist_by_side(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.join_waitlist_by_side(uuid, uuid, integer, integer) to authenticated;
