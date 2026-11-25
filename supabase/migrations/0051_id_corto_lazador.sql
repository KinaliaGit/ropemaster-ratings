-- ID corto del lazador (KIN-752): "RM-0001", fácil de decir y de compartir.
--
-- Decisiones:
--  * Es un número que se asigna solo (secuencia) y nunca se reutiliza: borrar o fusionar un perfil no libera su número, y una vez
--    puesto no se puede cambiar (lo vigila un trigger). La secuencia solo sube.
--  * `rm_number` es el número; `short_id` es el texto que se muestra: 'RM-' + el número con al menos 4 dígitos (RM-0001 ... RM-9999 y
--    después RM-10000 ... sin cambiar el formato). Es una columna generada, así que no puede salir distinta del número.
--  * Los perfiles que ya existen reciben su número aquí, en orden de creación (y por id a igual fecha).
--  * Es PÚBLICO a propósito (se comparte): se lee igual que el nombre. Nadie puede escribirlo desde la API (no hay permiso de columna).
--  * NO es el `global_id` (el uuid de `ropers.id`, que es el que usa el contrato con la app para ligar personas) ni el `public_id` que el
--    crossplay de la app guarda en cada base local. Es un identificador para personas; el contrato web-app lo manda como dato extra.
--  * La búsqueda del ranking público entiende "rm-42", "RM-0042" o "rm0042": si lo escrito es SOLO un ID, busca por ID.
--
-- Es aditivo: una columna nueva con valor para todas las filas, una secuencia y un índice único. Lo que ya existe sigue funcionando.

-- Nadie inserta perfiles mientras se numeran los existentes (así ninguno queda sin número).
lock table public.ropers in exclusive mode;

create sequence if not exists public.ropers_rm_number_seq as bigint;

alter table public.ropers add column if not exists rm_number bigint;

with ordered as (
  select id, row_number() over (order by created_at, id) as n from public.ropers where rm_number is null
)
update public.ropers r set rm_number = o.n + (select coalesce(max(x.rm_number), 0) from public.ropers x)
  from ordered o where r.id = o.id;

select setval('public.ropers_rm_number_seq', coalesce((select max(rm_number) from public.ropers), 0) + 1, false);
alter sequence public.ropers_rm_number_seq owned by public.ropers.rm_number;
alter table public.ropers alter column rm_number set default nextval('public.ropers_rm_number_seq');
alter table public.ropers alter column rm_number set not null;
create unique index if not exists ropers_rm_number_key on public.ropers (rm_number);

-- Insertar con la columna por defecto usa la secuencia con los permisos de quien inserta.
grant usage on sequence public.ropers_rm_number_seq to authenticated, service_role;

-- OJO: `lpad` RECORTA si el texto ya es más largo que el pedido (lpad('10000', 4, '0') = '1000'), por eso el caso aparte: sin él
-- RM-10000 saldría como RM-1000 y chocaría con el 1000.
alter table public.ropers add column if not exists short_id text
  generated always as ('RM-' || case when rm_number < 10000 then lpad(rm_number::text, 4, '0') else rm_number::text end) stored;
create unique index if not exists ropers_short_id_key on public.ropers (short_id);

grant select (rm_number, short_id) on public.ropers to anon, authenticated;

-- Una vez asignado, el número no cambia (ni siquiera con la llave de servicio).
create or replace function private.ropers_keep_rm_number() returns trigger
  language plpgsql set search_path = ''
  as $$
begin
  if new.rm_number is distinct from old.rm_number then
    raise exception 'rm_number_immutable' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists ropers_keep_rm_number on public.ropers;
create trigger ropers_keep_rm_number before update of rm_number on public.ropers
  for each row execute function private.ropers_keep_rm_number();

-- Búsqueda pública del ranking (la de la 0026, más la búsqueda por ID). Misma firma y mismos permisos.
-- Si lo escrito es SOLO un ID ("rm-42" / "rm0042", ya en minúsculas), devuelve a esa persona con su lugar real; si no, busca por nombre
-- como siempre. Hasta 15 dígitos para que el número siempre quepa en un bigint.
create or replace function public.public_ranking(
  p_discipline text, p_initial numeric, p_tokens text[] default null, p_after_rank bigint default null, p_limit integer default 50
) returns table (roper_id uuid, full_name text, avatar_path text, rating numeric, events_count integer, wins integer, is_initial boolean, rank bigint)
  language sql stable security invoker set search_path = ''
  as $$
    with q as (
      select
        coalesce(p_tokens, array[]::text[]) as tokens,
        case when cardinality(coalesce(p_tokens, array[]::text[])) = 1 and p_tokens[1] ~ '^rm-?[0-9]{1,15}$'
             then regexp_replace(p_tokens[1], '[^0-9]', '', 'g')::bigint end as rm
    ), ranked as (
      select p.id, p.full_name, p.avatar_path, p.rm_number,
             coalesce(rr.rating, p_initial) as rating, coalesce(rr.events_count, 0) as events_count, coalesce(rr.wins, 0) as wins,
             rr.roper_id is null as is_initial,
             row_number() over (order by coalesce(rr.rating, p_initial) desc, p.full_name asc, p.id asc) as rank,
             regexp_split_to_array(
               translate(lower(p.full_name), 'áéíóúüñàèìòùâêîôûäëïöç', 'aeiouunaeiouaeiouaeioc'), '\s+') as words
      from public.ropers p
      left join public.roper_ratings rr on rr.roper_id = p.id and rr.discipline = p_discipline
      where p.merged_into is null
    )
    select r.id, r.full_name, r.avatar_path, r.rating, r.events_count, r.wins, r.is_initial, r.rank
    from ranked r, q
    where (p_after_rank is null or r.rank > p_after_rank)
      and (
        case when q.rm is not null then r.rm_number = q.rm
        else not exists (
          select 1 from unnest(q.tokens) t(token)
          where not exists (select 1 from unnest(r.words) w where left(w, length(t.token)) = t.token)
        ) end
      )
    order by r.rank
    limit least(greatest(coalesce(p_limit, 50), 1), 101)
  $$;

revoke all on function public.public_ranking(text, numeric, text[], bigint, integer) from public;
grant execute on function public.public_ranking(text, numeric, text[], bigint, integer) to anon, authenticated;
