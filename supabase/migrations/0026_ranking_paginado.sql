-- Ranking público paginado y ordenado en la base (KIN-613). Solo cambios aditivos: una función nueva.
--
-- Antes la web traía 500 personas ORDENADAS POR NOMBRE y ordenaba por rating en memoria: con más de 500 lazadores podía quedar fuera
-- quien tuviera mejor rating. Ahora la base ordena (rating de mayor a menor, luego nombre, luego id), numera el lugar de cada quien
-- sobre TODO el ranking y entrega una página a la vez. La búsqueda filtra después de numerar, así que cada quien conserva su lugar.
--
-- Entran todos los perfiles visibles (sin fusionar); quien aún no tiene rating en la modalidad parte del rating inicial (p_initial),
-- igual que antes. Es `security invoker`: corre con los permisos de quien la llama, así que solo ve lo que ya veía un anónimo
-- (id, nombre y foto de `ropers`, y `roper_ratings`). No devuelve celular, correo ni ids de cuenta.
--
-- p_tokens: palabras de la búsqueda, ya en minúsculas y sin acentos (la web las normaliza). Cada una debe ser INICIO de alguna palabra
-- del nombre ("ana es" encuentra a "Ana Estrada"). Vacío o null: sin búsqueda.
-- p_after_rank: último lugar de la página anterior (null en la primera). Los lugares no cambian entre páginas salvo que cambie algún
-- rating mientras se navega; la web descarta repetidos.
-- p_limit: de 1 a 101 (la web pide una de más para saber si hay otra página).

create or replace function public.public_ranking(
  p_discipline text, p_initial numeric, p_tokens text[] default null, p_after_rank bigint default null, p_limit integer default 50
) returns table (roper_id uuid, full_name text, avatar_path text, rating numeric, events_count integer, wins integer, is_initial boolean, rank bigint)
  language sql stable security invoker set search_path = ''
  as $$
    with ranked as (
      select p.id, p.full_name, p.avatar_path,
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
    from ranked r
    where (p_after_rank is null or r.rank > p_after_rank)
      and not exists (
        select 1 from unnest(coalesce(p_tokens, array[]::text[])) t(token)
        where not exists (select 1 from unnest(r.words) w where left(w, length(t.token)) = t.token)
      )
    order by r.rank
    limit least(greatest(coalesce(p_limit, 50), 1), 101)
  $$;

revoke all on function public.public_ranking(text, numeric, text[], bigint, integer) from public;
grant execute on function public.public_ranking(text, numeric, text[], bigint, integer) to anon, authenticated;
