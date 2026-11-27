-- Enlace privado de conexión por evento (KIN-783 / H13.2, decisiones de KIN-782). Solo cambios aditivos.
--
-- El organizador genera, por evento PUBLICADO, una invitación de un solo uso. La app la canjea (POST /api/app/conexion) por un token de
-- sesión de ESE evento y de ahí en adelante usa solo ese token. Convive con el login por correo y contraseña (api_tokens, 0025), que no se
-- toca: las apps ya instaladas siguen igual.
--   * Permisos (scopes): `event:read` (siempre), `results:write` y `payments:write`. Un token de evento NO ve otros eventos, ni sube eventos
--     o series, ni lee el directorio.
--   * Solo se guarda el HASH sha256 de la invitación y del token; el secreto en claro se muestra una vez y nunca se escribe en la base.
--   * Vigencia: la invitación sin canjear vence a las 72 h; el token vence a los 30 días sin uso y, además, 7 días después de la fecha del
--     evento. El organizador lo revoca al instante.
--   * Un solo escritor por evento: solo un enlace activo con `results:write` a la vez (los demás son de lectura). Hasta 5 enlaces activos por evento.
--   * Con un escritor activo y los resultados del evento abiertos, no se pueden borrar resultados (candado en la base).
-- Todo se escribe SOLO con las funciones de abajo, que ejecuta únicamente el servidor (service_role). El organizador solo LEE sus enlaces
-- (sin los hashes). Se puede ejecutar más de una vez sin efecto extra.

create table if not exists public.event_connections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Operador',
  scopes text[] not null default array['event:read'],
  invite_hash text not null unique,
  invite_expires_at timestamptz not null,
  redeemed_at timestamptz,
  token_hash text unique,
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint event_connections_scopes_check check (
    scopes <@ array['event:read', 'results:write', 'payments:write']::text[] and 'event:read' = any (scopes)
  ),
  constraint event_connections_label_check check (char_length(label) between 1 and 60)
);
create index if not exists event_connections_event_idx on public.event_connections (event_id) where revoked_at is null;
create index if not exists event_connections_organizer_idx on public.event_connections (organizer_id, created_at desc);

alter table public.event_connections enable row level security;
revoke all on public.event_connections from anon, authenticated;
grant select (id, event_id, organizer_id, label, scopes, invite_expires_at, redeemed_at, device_name, created_at, last_used_at, revoked_at)
  on public.event_connections to authenticated;
drop policy if exists "enlaces propios" on public.event_connections;
create policy "enlaces propios" on public.event_connections for select to authenticated using (organizer_id = (select auth.uid()));

-- 1. Cuándo vence el token de un evento: 30 días sin uso (la creación cuenta como primer uso) y, si el evento tiene fecha, 7 días después de ella
--    (al terminar ese día). Única fuente del número: la usan verify_event_token, redeem_event_connection y create_event_connection.
create or replace function private.event_token_expires_at(p_created timestamptz, p_last_used timestamptz, p_event_date date)
returns timestamptz language sql immutable set search_path = '' as $$
  select least(
    coalesce(p_last_used, p_created) + interval '30 days',
    coalesce((p_event_date + 8)::timestamptz, 'infinity'::timestamptz)
  )
$$;

-- 2. ¿Un enlace sigue activo? Invitación sin canjear y sin vencer, o token canjeado y vigente; en ambos casos sin revocar.
create or replace function private.event_connection_active(
  p_redeemed timestamptz, p_invite_expires timestamptz, p_revoked timestamptz, p_created timestamptz, p_last_used timestamptz, p_event_date date
) returns boolean language sql stable set search_path = '' as $$
  select p_revoked is null and (
    (p_redeemed is null and p_invite_expires > now())
    or (p_redeemed is not null and private.event_token_expires_at(p_created, p_last_used, p_event_date) > now())
  )
$$;

-- 3. Crear una invitación. Errores: not_found (el evento no existe o no es del organizador), not_published (solo eventos publicados o
--    finalizados), invalid_scopes, limit (5 enlaces activos), writer_exists (ya hay un escritor activo).
create or replace function public.create_event_connection(p_organizer uuid, p_event uuid, p_invite_hash text, p_label text, p_scopes text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare ev record; v_id uuid; v_active integer; v_scopes text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('event_connections:' || p_event::text, 0));
  select e.organizer_id, e.status, e.event_date into ev from public.events e where e.id = p_event;
  if not found or ev.organizer_id <> p_organizer then raise exception 'not_found' using errcode = 'P0002'; end if;
  if ev.status not in ('publicado', 'finalizado') then raise exception 'not_published' using errcode = 'P0001'; end if;

  v_scopes := array(select distinct s from unnest(coalesce(p_scopes, array[]::text[]) || array['event:read']) as s order by s);
  if not (v_scopes <@ array['event:read', 'results:write', 'payments:write']::text[]) then raise exception 'invalid_scopes' using errcode = '22023'; end if;

  select count(*) into v_active from public.event_connections c
  where c.event_id = p_event and private.event_connection_active(c.redeemed_at, c.invite_expires_at, c.revoked_at, c.created_at, c.last_used_at, ev.event_date);
  if v_active >= 5 then raise exception 'limit' using errcode = 'P0001'; end if;

  if 'results:write' = any (v_scopes) and exists (
    select 1 from public.event_connections c
    where c.event_id = p_event and 'results:write' = any (c.scopes)
      and private.event_connection_active(c.redeemed_at, c.invite_expires_at, c.revoked_at, c.created_at, c.last_used_at, ev.event_date)
  ) then raise exception 'writer_exists' using errcode = 'P0001'; end if;

  insert into public.event_connections (event_id, organizer_id, label, scopes, invite_hash, invite_expires_at)
  values (p_event, p_organizer, left(coalesce(nullif(btrim(p_label), ''), 'Operador'), 60), v_scopes, p_invite_hash, now() + interval '72 hours')
  returning id into v_id;
  return v_id;
end $$;

-- 4. Canjear la invitación por un token de sesión del evento. Atómico y de un solo uso: devuelve la fila una vez; después (o si venció, se revocó,
--    el evento ya no está publicado o su vigencia ya pasó) no devuelve nada.
create or replace function public.redeem_event_connection(p_invite_hash text, p_token_hash text, p_device text)
returns table (connection_id uuid, event_id uuid, organizer_id uuid, scopes text[], expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.event_connections c
  set redeemed_at = now(), last_used_at = now(), token_hash = p_token_hash,
      device_name = left(coalesce(nullif(btrim(p_device), ''), 'Equipo'), 60)
  from public.events e
  where c.invite_hash = p_invite_hash and e.id = c.event_id
    and c.revoked_at is null and c.redeemed_at is null and c.invite_expires_at > now()
    and e.status in ('publicado', 'finalizado') and e.organizer_id = c.organizer_id
    and private.event_token_expires_at(now(), null, e.event_date) > now()
  returning c.id, c.event_id, c.organizer_id, c.scopes, private.event_token_expires_at(now(), null, e.event_date);
end $$;

-- 5. Comprobar un token de evento: devuelve el organizador dueño, el evento, los permisos y el estado del evento (la ruta decide qué hacer si
--    ya no es público). Nada si no existe, se revocó o venció. Cada uso reinicia el plazo de inactividad; last_used_at se actualiza como
--    máximo una vez por minuto.
create or replace function public.verify_event_token(p_hash text)
returns table (organizer_id uuid, event_id uuid, scopes text[], event_status text)
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select k.id, k.organizer_id, k.event_id, k.scopes, k.last_used_at, k.created_at, e.status, e.event_date, e.organizer_id as owner
  into c from public.event_connections k join public.events e on e.id = k.event_id
  where k.token_hash = p_hash and k.redeemed_at is not null and k.revoked_at is null
    and private.event_token_expires_at(k.created_at, k.last_used_at, e.event_date) > now();
  if not found or c.owner <> c.organizer_id then return; end if;
  if c.last_used_at is null or c.last_used_at < now() - interval '1 minute' then
    update public.event_connections set last_used_at = now() where id = c.id;
  end if;
  return query select c.owner, c.event_id, c.scopes, c.status;
end $$;

-- 6. Revocar: un enlace concreto del organizador (desde su panel) o el token que se está usando (cierre de sesión de la app).
create or replace function public.revoke_event_connection(p_organizer uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.event_connections set revoked_at = now() where id = p_id and organizer_id = p_organizer and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

create or replace function public.revoke_event_connection_by_token(p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.event_connections set revoked_at = now() where token_hash = p_hash and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

-- 7. app_organizer_events con un evento opcional (`p_event`): un token de evento solo descarga ese evento. Sin `p_event` devuelve exactamente lo
--    mismo que antes. Se reemplaza la función (no se puede cambiar la firma con "create or replace"): se borra la versión de 6 argumentos y se
--    crea la de 7 con el mismo nombre y permisos. Cuerpo igual al de la 0038 salvo el filtro por evento.
drop function if exists public.app_organizer_events(uuid, timestamptz, timestamptz, timestamptz, uuid, integer);
create or replace function public.app_organizer_events(
  p_organizer uuid,
  p_since timestamptz,
  p_snapshot timestamptz,
  p_after_changed timestamptz,
  p_after_id uuid,
  p_limit integer,
  p_event uuid default null
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
    where e.organizer_id = p_organizer and e.status in ('publicado', 'finalizado') and (p_event is null or e.id = p_event)
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
        'payment_method', r.payment_method,
        'role', r.role,
        'packages', r.packages
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

-- 8. Candado: con un escritor activo y los resultados abiertos, no se borran resultados del evento (decisión 6 de KIN-782). La web no tiene un botón
--    para borrar resultados; esto cierra también cualquier otro camino. Con el evento cerrado o sin enlace de escritura activo, todo sigue igual.
create or replace function private.block_result_delete_while_connected() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.event_connections c join public.events e on e.id = c.event_id
    where c.event_id = old.event_id and 'results:write' = any (c.scopes) and e.results_closed_at is null
      and private.event_connection_active(c.redeemed_at, c.invite_expires_at, c.revoked_at, c.created_at, c.last_used_at, e.event_date)
  ) then
    raise exception 'connected_event' using errcode = 'P0001', hint = 'El evento está conectado a la app: revoca el enlace de escritura o ciérralo antes de borrar resultados.';
  end if;
  return old;
end $$;
drop trigger if exists event_results_no_delete_while_connected on public.event_results;
create trigger event_results_no_delete_while_connected before delete on public.event_results
  for each row execute function private.block_result_delete_while_connected();

-- Permisos: solo el servidor ejecuta estas funciones.
revoke all on function private.event_token_expires_at(timestamptz, timestamptz, date) from public, anon, authenticated;
revoke all on function private.event_connection_active(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, date) from public, anon, authenticated;
revoke all on function private.block_result_delete_while_connected() from public, anon, authenticated;
revoke all on function public.create_event_connection(uuid, uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function public.redeem_event_connection(text, text, text) from public, anon, authenticated;
revoke all on function public.verify_event_token(text) from public, anon, authenticated;
revoke all on function public.revoke_event_connection(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_event_connection_by_token(text) from public, anon, authenticated;
revoke all on function public.app_organizer_events(uuid, timestamptz, timestamptz, timestamptz, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.create_event_connection(uuid, uuid, text, text, text[]) to service_role;
grant execute on function public.redeem_event_connection(text, text, text) to service_role;
grant execute on function public.verify_event_token(text) to service_role;
grant execute on function public.revoke_event_connection(uuid, uuid) to service_role;
grant execute on function public.revoke_event_connection_by_token(text) to service_role;
grant execute on function public.app_organizer_events(uuid, timestamptz, timestamptz, timestamptz, uuid, integer, uuid) to service_role;
