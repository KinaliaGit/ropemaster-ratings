-- ============================================================================================================
-- PARA EJECUTAR A MANO en el editor SQL del proyecto de Supabase `rope-master-licencias` (NO se aplica desde el repo).
-- Qué hace: crea UNA función de solo lectura que la web de ratings usa para saber si un correo tiene una licencia vigente.
--  * Responde solo: ¿vigente?, plan, folio de la compra y fecha de vencimiento. Sin nombres ni otros datos del comprador.
--  * Exige una clave secreta larga (se guarda aquí solo su hash SHA-256). Con una clave incorrecta responde "forbidden",
--    así nadie puede averiguar qué correos tienen licencia llamándola con la llave pública.
--  * No modifica ninguna tabla existente. Se puede deshacer con el bloque «DESHACER» de abajo.
-- Vigente = estatus 'emitida' o 'activada', sin revocar, ya empezada (valid_from) y no vencida (expires_at).
-- Tras ejecutarlo: poner la clave secreta (LICENCIAS_CHECK_SECRET) en las variables de Vercel de la web de ratings.
-- ============================================================================================================

create schema if not exists private;

create table if not exists private.web_check_secret (
  id boolean primary key default true check (id),     -- una sola fila
  secret_sha256 text not null,
  created_at timestamptz not null default now()
);
alter table private.web_check_secret enable row level security;
revoke all on private.web_check_secret from public, anon, authenticated;

-- Hash SHA-256 de la clave secreta (la clave en claro NO va aquí; vive en LICENCIAS_CHECK_SECRET).
insert into private.web_check_secret (secret_sha256)
values ('27cb1e57cd4c55649cb077eec01590bd10a4b74ca4aba7baf1626c91c6e3df97')
on conflict (id) do update set secret_sha256 = excluded.secret_sha256, created_at = now();

create or replace function public.licencia_vigente_web(p_email text, p_secret text) returns jsonb
  language plpgsql stable security definer set search_path = ''
  as $$
declare ok boolean; r record;
begin
  select s.secret_sha256 = encode(extensions.digest(convert_to(coalesce(p_secret, ''), 'utf8'), 'sha256'), 'hex')
    into ok from private.web_check_secret s;
  if not coalesce(ok, false) then raise exception 'forbidden' using errcode = '42501'; end if;

  select l.plan_type::text as plan, coalesce(l.order_id, l.folio) as order_id, l.expires_at
    into r
    from public.licencias l
   where lower(l.email::text) = lower(btrim(coalesce(p_email, '')))
     and l.estatus::text in ('emitida', 'activada')
     and l.revoked_at is null
     and (l.valid_from is null or l.valid_from <= now())
     and (l.expires_at is null or l.expires_at > now())
   order by (l.expires_at is null) desc, l.expires_at desc nulls last, (l.plan_type::text = 'local') desc
   limit 1;

  if not found then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'plan', r.plan, 'order_id', r.order_id, 'valid_until', r.expires_at);
end $$;

revoke all on function public.licencia_vigente_web(text, text) from public;
grant execute on function public.licencia_vigente_web(text, text) to anon, authenticated;

-- ------------------------------------------------------------------------------------------------------------
-- DESHACER (por si se quiere quitar todo):
--   drop function if exists public.licencia_vigente_web(text, text);
--   drop table if exists private.web_check_secret;
-- ------------------------------------------------------------------------------------------------------------
