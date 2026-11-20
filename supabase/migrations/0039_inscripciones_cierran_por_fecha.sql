-- Un evento cuya fecha ya pasó no acepta inscripciones (KIN-656). Solo cambia la regla de private.register_for_event de CUATRO argumentos (la de la 0038,
-- con paquetes); la de tres argumentos sigue siendo su envoltorio, así que también queda cubierta. Mismo nombre y firma: los permisos se conservan; no toca
-- tablas. La fecha se compara en la zona horaria del evento: el mismo día todavía se puede. El organizador sigue pudiendo inscribir a mano (organizer_enroll no
-- cambia). Se puede ejecutar más de una vez.

create or replace function private.register_for_event(p_event uuid, p_category uuid, p_role text, p_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid; roles text[]; r text; first_reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  perform private.check_packages(ev.draw_type, p_packages);
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then
    raise exception 'not_open_yet' using errcode = 'P0001';
  end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  -- KIN-656: un evento cuya fecha ya pasó (en SU zona horaria) deja de aceptar inscripciones aunque nadie lo haya cerrado.
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  roles := private.roles_for_registration(rid, p_role, false);
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[])) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n + cardinality(roles) > ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
      values (p_event, rid, p_category, fee * p_packages, r, p_packages) returning id into reg;
    first_reg := coalesce(first_reg, reg);
  end loop;
  return first_reg;
end $$;
revoke all on function private.register_for_event(uuid, uuid, text, integer) from public, anon;
grant execute on function private.register_for_event(uuid, uuid, text, integer) to authenticated;
