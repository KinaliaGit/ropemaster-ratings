-- Un token por equipo y vencimiento por inactividad (KIN-605). Solo cambios aditivos sobre 0003, 0009 y 0011.
-- Hasta hoy había UN solo código activo por organizador y generar otro revocaba el anterior. Para que la app pueda entrar con correo y
-- contraseña (KIN-606) sin echar a otras computadoras, cada equipo tiene su propio token. El código manual (el que se copia del panel)
-- se conserva como respaldo: sigue siendo uno solo y no cuenta dentro de los equipos.
-- Todo se escribe SOLO con las funciones de abajo, que ejecuta únicamente el servidor (service_role).

-- 1. Tipo de token: `manual` (el código del panel) o `login` (un equipo que entró con correo y contraseña). Los existentes son manuales.
alter table public.api_tokens add column if not exists kind text not null default 'manual' check (kind in ('manual', 'login'));

-- 2. Antes: un solo activo por organizador. Ahora: un solo manual activo (los equipos son varios; el límite lo aplica create_device_token).
drop index if exists public.api_tokens_one_active_idx;
create unique index if not exists api_tokens_one_active_manual_idx on public.api_tokens (organizer_id) where revoked_at is null and kind = 'manual';
create index if not exists api_tokens_active_by_organizer_idx on public.api_tokens (organizer_id) where revoked_at is null;

-- Los organizadores leen sus tokens (también el tipo) sin la columna del hash.
grant select (id, name, created_at, last_used_at, revoked_at, kind) on public.api_tokens to authenticated;

-- 3. Un token vence cuando pasan estos días sin usarse (la fecha de creación cuenta como primer uso). Cada uso exitoso reinicia el plazo.
--    Es la única fuente del número: lo usan verify_api_token y create_device_token.
create or replace function public.api_token_idle_days() returns integer language sql immutable set search_path = '' as $$ select 30 $$;
revoke all on function public.api_token_idle_days() from public, anon, authenticated;
grant execute on function public.api_token_idle_days() to service_role;

-- 4. El código manual: genera uno y revoca solo el manual anterior (los equipos no se tocan).
create or replace function public.rotate_api_token(p_organizer uuid, p_hash text, p_name text default 'App local')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.api_tokens set revoked_at = now() where organizer_id = p_organizer and kind = 'manual' and revoked_at is null;
  insert into public.api_tokens (organizer_id, name, token_hash, kind) values (p_organizer, p_name, p_hash, 'manual') returning id into v_id;
  return v_id;
end $$;

-- 5. Un equipo nuevo: crea su token (solo se guarda el hash). Devuelve null si el organizador ya tiene `p_max` equipos activos; no cierra
--    ninguno. Un equipo vencido o revocado no cuenta. El candado evita que dos logins simultáneos se pasen del límite.
create or replace function public.create_device_token(p_organizer uuid, p_hash text, p_name text, p_max integer default 3)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_active integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('api_tokens:' || p_organizer::text, 0));
  select count(*) into v_active from public.api_tokens t
  where t.organizer_id = p_organizer and t.kind = 'login' and t.revoked_at is null
    and coalesce(t.last_used_at, t.created_at) > now() - make_interval(days => public.api_token_idle_days());
  if v_active >= greatest(1, coalesce(p_max, 3)) then return null; end if;
  insert into public.api_tokens (organizer_id, name, token_hash, kind)
  values (p_organizer, left(coalesce(nullif(btrim(p_name), ''), 'Equipo'), 60), p_hash, 'login') returning id into v_id;
  return v_id;
end $$;

-- 6. Comprueba un token: devuelve el organizador dueño, o null si no existe, fue revocado o venció por inactividad.
--    Cada uso válido reinicia el plazo; last_used_at se actualiza como máximo una vez por minuto para no escribir en cada petición.
create or replace function public.verify_api_token(p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid; v_last timestamptz;
begin
  select t.id, t.organizer_id, t.last_used_at into v_id, v_org, v_last from public.api_tokens t
  where t.token_hash = p_hash and t.revoked_at is null
    and coalesce(t.last_used_at, t.created_at) > now() - make_interval(days => public.api_token_idle_days());
  if v_id is null then return null; end if;
  if v_last is null or v_last < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = v_id;
  end if;
  return v_org;
end $$;

-- 7. Revocar: un equipo concreto del organizador (desde su panel) o el token que se está usando (cierre de sesión de la app).
create or replace function public.revoke_api_token(p_organizer uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.api_tokens set revoked_at = now() where id = p_id and organizer_id = p_organizer and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

create or replace function public.revoke_api_token_by_hash(p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.api_tokens set revoked_at = now() where token_hash = p_hash and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

revoke all on function public.rotate_api_token(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_device_token(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.verify_api_token(text) from public, anon, authenticated;
revoke all on function public.revoke_api_token(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_api_token_by_hash(text) from public, anon, authenticated;
grant execute on function public.rotate_api_token(uuid, text, text) to service_role;
grant execute on function public.create_device_token(uuid, text, text, integer) to service_role;
grant execute on function public.verify_api_token(text) to service_role;
grant execute on function public.revoke_api_token(uuid, uuid) to service_role;
grant execute on function public.revoke_api_token_by_hash(text) to service_role;
