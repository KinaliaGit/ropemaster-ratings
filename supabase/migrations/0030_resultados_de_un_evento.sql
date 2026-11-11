-- Resultados de UN evento, paginados en la base (KIN-608). Solo cambios aditivos: una función nueva.
--
-- Hasta ahora los resultados solo se veían en el perfil de cada lazador. Esta función los entrega por evento y modalidad, ordenados por
-- lugar, de a una página. Incluye a la gente que corrió en el evento y no tiene lazador en la web (se muestra su nombre y su tiempo,
-- solo dentro del evento). Las rondas NO viajan aquí: se piden aparte, solo del resultado que se abre.
--
-- Orden: quien tiene lugar primero (de menor a mayor lugar), luego quien no lo tiene (sin descalificar antes que descalificados); a igual
-- orden, por tiempo, nombre e id. La posición (`pos`) se numera sobre todo el evento y es el cursor: la página siguiente pide `pos > p_after`.
-- `total` es cuántos resultados hay en esa modalidad.
--
-- `security invoker`: corre con los permisos de quien la llama. Los resultados solo se ven si el evento es visible (0029), así que los de un
-- borrador no salen. Solo devuelve nombre, foto, tiempos y lugar: nunca celular, correo ni ids de cuenta. El `roper_id` solo viene si el
-- perfil es visible (los fusionados no), para poder enlazar al perfil.

create or replace function public.public_event_results(p_event uuid, p_discipline text, p_after bigint default null, p_limit integer default 30)
returns table (
  id uuid, roper_id uuid, name text, avatar_path text, time_ms integer, penalty_ms integer, disqualified boolean, place integer,
  completed_runs integer, nt_count integer, dq_count integer, has_rounds boolean, pos bigint, total bigint
)
  language sql stable security invoker set search_path = ''
  as $$
    with r as (
      select er.id, p.id as roper_id, coalesce(p.full_name, er.participant_name, '') as name, p.avatar_path,
             er.time_ms, coalesce(er.penalty_ms, 0) as penalty_ms, er.disqualified, er.place,
             er.completed_runs, er.nt_count, er.dq_count,
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
           r.completed_runs, r.nt_count, r.dq_count, r.has_rounds, r.pos, r.total
    from r
    where p_after is null or r.pos > p_after
    order by r.pos
    limit least(greatest(coalesce(p_limit, 30), 1), 101)
  $$;

revoke all on function public.public_event_results(uuid, text, bigint, integer) from public;
grant execute on function public.public_event_results(uuid, text, bigint, integer) to anon, authenticated;
