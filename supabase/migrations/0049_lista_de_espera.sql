-- Lista de espera de un evento lleno (KIN-726). Solo cambios aditivos: una tabla nueva, funciones nuevas y un trigger nuevo; lo único que se
-- reemplaza es la lista de tipos permitidos de `notifications.kind` (se AGREGA 'promoted').
--  * El cupo (`events.capacity`) ya existía: cuenta inscripciones. Al llegar al límite, quien quiera entrar pasa a `event_waitlist`.
--  * La lista de espera es una tabla APARTE de `registrations` a propósito: una persona en espera no cuenta en el cupo, no se cobra, no sale en las
--    listas de inscritos ni en la API de la app (`registrations`), y nada de lo que lee `registrations` la ve por accidente.
--  * Cada fila es una persona + categoría + rol (con el rol "Ambos" que elige los dos son dos filas, igual que las inscripciones). El lugar en la
--    fila es POR EVENTO y sale del orden de llegada (created_at, id): no se guarda, así nunca queda desfasado.
--  * Nadie escribe `event_waitlist` directo: solo las funciones de abajo (SECURITY DEFINER, esquema private). Leen: la persona (sus filas) y el
--    organizador del evento (o un admin).
--  * Pasar a alguien de espera a inscrito lo hace el organizador, a mano (promote_waitlist_entry): respeta el cupo, el rating máximo y la
--    categoría que ya existen, deja la inscripción pendiente de pago y avisa a la persona dentro de la web.
--  * Si la persona se inscribe por otra vía (el organizador la inscribe, o se abre un lugar y entra sola), el trigger de `registrations` borra su fila.
--  * Cambiar la lista de espera mueve `events.updated_at`, para que la sincronización incremental con la app vuelva a bajar el evento.
-- Se puede ejecutar más de una vez sin efecto extra.

create table if not exists public.event_waitlist (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  roper_id uuid not null references public.ropers(id) on delete cascade,
  category_id uuid not null references public.event_categories(id) on delete cascade,
  role text check (role in ('header', 'heeler')),
  packages integer not null default 1 check (packages between 1 and 99),
  created_at timestamptz not null default now()
);
create unique index if not exists event_waitlist_unique on public.event_waitlist (event_id, roper_id, category_id, coalesce(role, ''));
create index if not exists event_waitlist_order_idx on public.event_waitlist (event_id, created_at, id);
create index if not exists event_waitlist_roper_idx on public.event_waitlist (roper_id);

alter table public.event_waitlist enable row level security;
revoke all on public.event_waitlist from anon, authenticated;
grant select on public.event_waitlist to authenticated;
drop policy if exists "lista de espera propia o del organizador (leer)" on public.event_waitlist;
create policy "lista de espera propia o del organizador (leer)" on public.event_waitlist for select to authenticated using (
  roper_id = (select private.current_roper_id())
  or exists (select 1 from public.events e where e.id = event_waitlist.event_id and e.organizer_id = (select auth.uid()))
  or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
);

-- Aviso dentro de la web cuando pasan a la persona de espera a inscrita.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('removed', 'event_deleted', 'promoted'));

-- Mismo tope de rating individual que las inscripciones (KIN-638): quien lo rebasa no entra ni a la lista de espera.
-- (La función solo usa new.event_id y new.roper_id, así que sirve tal cual para esta tabla.)
drop trigger if exists event_waitlist_rating_limit on public.event_waitlist;
create trigger event_waitlist_rating_limit before insert on public.event_waitlist
  for each row execute function private.enforce_registration_rating_limit();

-- Un cambio en la lista de espera cuenta como cambio del evento para la sincronización incremental (?since=).
drop trigger if exists event_waitlist_touch_event on public.event_waitlist;
create trigger event_waitlist_touch_event after insert or update or delete on public.event_waitlist
  for each row execute function public.touch_event_of_child();

-- Quien ya quedó inscrito (por cualquier vía) deja la lista de espera de ese mismo lugar (categoría y rol).
create or replace function private.drop_waitlist_on_register() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  delete from public.event_waitlist w
    where w.event_id = new.event_id and w.roper_id = new.roper_id and w.category_id is not distinct from new.category_id and w.role is not distinct from new.role;
  return null;
end $$;
revoke all on function private.drop_waitlist_on_register() from public, anon, authenticated;
drop trigger if exists registrations_drop_waitlist on public.registrations;
create trigger registrations_drop_waitlist after insert on public.registrations
  for each row execute function private.drop_waitlist_on_register();

-- Entrar a la lista de espera. Mismas reglas que inscribirse (evento publicado, ventana de inscripción, fecha, no estar sacado, categoría, rol,
-- paquetes y no repetir); solo se acepta si inscribirse hoy fallaría por cupo: si hay lugar, 'not_full' (hay que inscribirse normal).
-- Devuelve el id de la (primera) fila creada.
create or replace function private.join_waitlist(p_event uuid, p_category uuid, p_role text, p_packages integer) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; n integer; roles text[]; r text; entry uuid; first_entry uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, draw_type, registration_closed, registration_closes_at, registration_opens_at, event_date, timezone into ev
    from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  perform private.check_packages(ev.draw_type, p_packages);
  if ev.registration_opens_at is not null and now() < ev.registration_opens_at then raise exception 'not_open_yet' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if ev.event_date is not null and ev.event_date < (now() at time zone ev.timezone)::date then raise exception 'registration_closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.event_categories where id = p_category and event_id = p_event) then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  roles := private.roles_for_registration(rid, p_role, false);
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[]))
     or exists (select 1 from public.event_waitlist where event_id = p_event and roper_id = rid and category_id = p_category
             and (role is null or role = any (roles) or roles = array[null]::text[])) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is null or n + cardinality(roles) <= ev.capacity then raise exception 'not_full' using errcode = 'P0001'; end if;

  foreach r in array roles loop
    insert into public.event_waitlist (event_id, roper_id, category_id, role, packages) values (p_event, rid, p_category, r, p_packages) returning id into entry;
    first_entry := coalesce(first_entry, entry);
  end loop;
  return first_entry;
end $$;
revoke all on function private.join_waitlist(uuid, uuid, text, integer) from public, anon;
grant execute on function private.join_waitlist(uuid, uuid, text, integer) to authenticated;
create or replace function public.join_waitlist(p_event uuid, p_category uuid, p_role text, p_packages integer) returns uuid
  language sql set search_path = '' as $$ select private.join_waitlist(p_event, p_category, p_role, p_packages) $$;
revoke all on function public.join_waitlist(uuid, uuid, text, integer) from public, anon;
grant execute on function public.join_waitlist(uuid, uuid, text, integer) to authenticated;

-- La persona sale de la lista de espera (solo sus propias filas).
create or replace function private.leave_waitlist(p_entry uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare rid uuid := (select private.current_roper_id());
begin
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.event_waitlist where id = p_entry and roper_id = rid;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;
revoke all on function private.leave_waitlist(uuid) from public, anon;
grant execute on function private.leave_waitlist(uuid) to authenticated;
create or replace function public.leave_waitlist(p_entry uuid) returns void
  language sql set search_path = '' as $$ select private.leave_waitlist(p_entry) $$;
revoke all on function public.leave_waitlist(uuid) from public, anon;
grant execute on function public.leave_waitlist(uuid) to authenticated;

-- El organizador del evento (o un admin) pasa a alguien de espera a inscrito. Solo si hay lugar ('full' si no). La inscripción nace pendiente de pago
-- con el monto de la categoría * paquetes, igual que al inscribirse; el trigger de arriba borra la fila de espera y el de rating puede frenarla ('rating_limit').
-- Se puede también después de cerrar las inscripciones (el organizador ya puede inscribir a mano, KIN-626), pero no en un evento finalizado.
create or replace function private.promote_waitlist_entry(p_entry uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); is_admin boolean; w record; ev record; n integer; fee integer; reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  is_admin := exists (select 1 from public.admins a where a.user_id = uid);
  if not is_admin and not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select event_id into w from public.event_waitlist where id = p_entry;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select id, name, event_date, capacity, organizer_id, status, draw_type into ev from public.events where id = w.event_id for update;
  if ev.organizer_id <> uid and not is_admin then raise exception 'not_found' using errcode = 'P0002'; end if;
  select id, roper_id, category_id, role, packages into w from public.event_waitlist where id = p_entry for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if ev.status <> 'publicado' then raise exception 'closed' using errcode = 'P0001'; end if;
  select count(*) into n from public.registrations where event_id = ev.id;
  if ev.capacity is not null and n + 1 > ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;
  select fee_cents into fee from public.event_categories where id = w.category_id and event_id = ev.id;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations where event_id = ev.id and roper_id = w.roper_id and category_id = w.category_id and role is not distinct from w.role) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  insert into public.registrations (event_id, roper_id, category_id, amount_cents, role, packages)
    values (ev.id, w.roper_id, w.category_id, fee * w.packages, w.role, w.packages) returning id into reg;
  insert into public.notifications (user_id, kind, event_id, event_name, event_date)
    select ro.user_id, 'promoted', ev.id, ev.name, ev.event_date from public.ropers ro where ro.id = w.roper_id and ro.user_id is not null;
  return reg;
end $$;
revoke all on function private.promote_waitlist_entry(uuid) from public, anon;
grant execute on function private.promote_waitlist_entry(uuid) to authenticated;
create or replace function public.promote_waitlist_entry(p_entry uuid) returns uuid
  language sql set search_path = '' as $$ select private.promote_waitlist_entry(p_entry) $$;
revoke all on function public.promote_waitlist_entry(uuid) from public, anon;
grant execute on function public.promote_waitlist_entry(uuid) to authenticated;

-- El organizador del evento (o un admin) quita a alguien de la lista de espera.
create or replace function private.remove_waitlist_entry(p_entry uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); is_admin boolean;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  is_admin := exists (select 1 from public.admins a where a.user_id = uid);
  if not is_admin and not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.event_waitlist w using public.events e
    where w.id = p_entry and e.id = w.event_id and (e.organizer_id = uid or is_admin);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;
revoke all on function private.remove_waitlist_entry(uuid) from public, anon;
grant execute on function private.remove_waitlist_entry(uuid) to authenticated;
create or replace function public.remove_waitlist_entry(p_entry uuid) returns void
  language sql set search_path = '' as $$ select private.remove_waitlist_entry(p_entry) $$;
revoke all on function public.remove_waitlist_entry(uuid) from public, anon;
grant execute on function public.remove_waitlist_entry(uuid) to authenticated;

-- Las filas de espera de la persona que llama, con su lugar en la fila del evento. El lugar cuenta a TODOS los de espera de ese evento (también a los
-- de otras categorías: el cupo es del evento), pero no revela a nadie: solo devuelve un número.
create or replace function public.my_waitlist() returns table (id uuid, event_id uuid, category_id uuid, role text, packages integer, created_at timestamptz, place integer)
  language sql stable security definer set search_path = ''
  as $$ select w.id, w.event_id, w.category_id, w.role, w.packages, w.created_at,
               (select count(*)::integer from public.event_waitlist o where o.event_id = w.event_id and (o.created_at, o.id) <= (w.created_at, w.id))
        from public.event_waitlist w
        where w.roper_id = (select private.current_roper_id())
        order by w.created_at, w.id $$;
revoke all on function public.my_waitlist() from public, anon;
grant execute on function public.my_waitlist() to authenticated;

-- Cuántas personas esperan en cada evento público (solo números, para mostrar "N en lista de espera").
create or replace function public.event_waitlist_counts() returns table (event_id uuid, n integer)
  language sql stable security definer set search_path = ''
  as $$ select w.event_id, count(*)::integer from public.event_waitlist w join public.events e on e.id = w.event_id
        where e.status = 'publicado' group by w.event_id $$;
revoke all on function public.event_waitlist_counts() from public;
grant execute on function public.event_waitlist_counts() to anon, authenticated;

-- Participantes de un evento para la app (KIN-586): igual que la 0032, pero también devuelve a quienes están en la lista de espera del evento. La app los
-- necesita para reconocer a la persona (correo, rating) y mostrarla en su lista de espera; NO los cuenta como inscritos (eso lo dice `registrations`).
-- Mismo nombre, firma y tipo de retorno: los permisos se conservan (se repiten abajo por claridad).
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
  ratings jsonb,
  role text,
  favorite_role text
) language sql stable security definer set search_path = '' as $$
  with registered as (
    -- KIN-726: también las personas en lista de espera (la app las necesita para reconocerlas); no cuentan como inscritas.
    select x.roper_id, max(x.at) as registered_at
    from (
      select r.roper_id, r.created_at as at from public.registrations r where r.event_id = p_event
      union all
      select w.roper_id, w.created_at as at from public.event_waitlist w where w.event_id = p_event
    ) x
    group by x.roper_id
  ), people as (
    select
      ro.id as global_id,
      ro.full_name as name,
      rc.email,
      coalesce(rc.claimed, false) as claimed,
      greatest(ro.updated_at, g.registered_at, coalesce(rc.updated_at, ro.updated_at), coalesce(rt.last_rated_at, ro.updated_at)) as changed_at,
      coalesce(rt.ratings, '{}'::jsonb) as ratings,
      ro.primary_role as role,
      ro.favorite_role
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
  select p.global_id, p.name, p.email, p.claimed, p.changed_at, p.ratings, p.role, p.favorite_role
  from people p
  where p.changed_at <= p_snapshot
    and (p_since is null or p.changed_at >= p_since)
    and (p_after_changed is null or (p.changed_at, p.global_id) > (p_after_changed, p_after_id))
  order by p.changed_at, p.global_id
  limit greatest(1, least(coalesce(p_limit, 200), 501))
$$;
revoke all on function public.app_event_participants(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.app_event_participants(uuid, timestamptz, timestamptz, timestamptz, uuid, integer) to service_role;
