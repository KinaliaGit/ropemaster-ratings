-- Paquetes y tiros en los resultados públicos de un evento (KIN-648). Cambia el tipo de lo que devuelve `public_event_results` (dos columnas
-- nuevas al final: `packages` y `shots`, NULL fuera de Lazada Sorteada), por eso se borra y se vuelve a crear con los mismos permisos.
-- Nada se guarda ni se altera: solo se leen las columnas que agregó la 0041. Mismas reglas que la 0030 (security invoker, solo eventos visibles).

drop function if exists public.public_event_results(uuid, text, bigint, integer);

create or replace function public.public_event_results(p_event uuid, p_discipline text, p_after bigint default null, p_limit integer default 30)
returns table (
  id uuid, roper_id uuid, name text, avatar_path text, time_ms integer, penalty_ms integer, disqualified boolean, place integer,
  completed_runs integer, nt_count integer, dq_count integer, has_rounds boolean, pos bigint, total bigint,
  packages integer, shots integer
)
  language sql stable security invoker set search_path = ''
  as $$
    with r as (
      select er.id, p.id as roper_id, coalesce(p.full_name, er.participant_name, '') as name, p.avatar_path,
             er.time_ms, coalesce(er.penalty_ms, 0) as penalty_ms, er.disqualified, er.place,
             er.completed_runs, er.nt_count, er.dq_count, er.packages, er.shots,
             er.rounds is not null and jsonb_array_length(er.rounds) > 0 as has_rounds,
             row_number() over (
               order by er.place asc nulls last, er.disqualified asc, er.time_ms asc nulls last, coalesce(p.full_name, er.participant_name, '') asc, er.id asc
             ) as pos,
             count(*) over () as total
      from public.event_results er
      left join public.ropers p on p.id = er.roper_id
      where er.event_id = p_event and er.discipline = p_discipline
    )
    select r.id, r.roper_id, r.name, r.avatar_path, r.time_ms, r.penalty_ms, r.disqualified, r.place,
           r.completed_runs, r.nt_count, r.dq_count, r.has_rounds, r.pos, r.total, r.packages, r.shots
    from r
    where p_after is null or r.pos > p_after
    order by r.pos
    limit least(greatest(coalesce(p_limit, 30), 1), 101)
  $$;

revoke all on function public.public_event_results(uuid, text, bigint, integer) from public;
grant execute on function public.public_event_results(uuid, text, bigint, integer) to anon, authenticated;
