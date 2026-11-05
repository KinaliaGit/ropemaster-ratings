-- Códigos de conexión de la app local guardados en la base (KIN-584). Solo cambios aditivos sobre 0003 y 0009.
-- La web los maneja con la llave de servicio (service_role); los organizadores solo ven sus fechas, nunca el hash.

-- Un solo código activo por organizador (el panel y la rotación dependen de esto).
create unique index if not exists api_tokens_one_active_idx on api_tokens (organizer_id) where revoked_at is null;

-- Los organizadores leen sus códigos sin la columna del hash; no pueden escribir nada (ni crear ni revocar directo).
revoke all on api_tokens from anon, authenticated;
grant select (id, name, created_at, last_used_at, revoked_at) on api_tokens to authenticated;

-- Genera un código nuevo y revoca el anterior en una sola transacción (evita carreras si se pulsa dos veces).
create or replace function public.rotate_api_token(p_organizer uuid, p_hash text, p_name text default 'App local')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.api_tokens set revoked_at = now() where organizer_id = p_organizer and revoked_at is null;
  insert into public.api_tokens (organizer_id, name, token_hash) values (p_organizer, p_name, p_hash) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.rotate_api_token(uuid, text, text) from public, anon, authenticated;
grant execute on function public.rotate_api_token(uuid, text, text) to service_role;

-- Intentos fallidos con un código inválido, por IP (se guarda solo el hash de la IP). Frena a quien quiera adivinar códigos.
create table if not exists api_auth_failures (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists api_auth_failures_ip_idx on api_auth_failures (ip_hash, created_at);
create index if not exists api_auth_failures_age_idx on api_auth_failures (created_at);
alter table api_auth_failures enable row level security;
revoke all on api_auth_failures from anon, authenticated;

create or replace function public.api_auth_is_blocked(p_ip_hash text, p_limit integer default 20, p_window_seconds integer default 300)
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) >= p_limit from public.api_auth_failures
  where ip_hash = p_ip_hash and created_at > now() - make_interval(secs => p_window_seconds)
$$;

create or replace function public.api_auth_record_failure(p_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.api_auth_failures where created_at < now() - interval '1 day';
  insert into public.api_auth_failures (ip_hash) values (p_ip_hash);
end $$;

revoke all on function public.api_auth_is_blocked(text, integer, integer) from public, anon, authenticated;
revoke all on function public.api_auth_record_failure(text) from public, anon, authenticated;
grant execute on function public.api_auth_is_blocked(text, integer, integer) to service_role;
grant execute on function public.api_auth_record_failure(text) to service_role;
