-- Historial y resumen del lazador, paginados en la base (KIN-609). Solo cambios aditivos: dos funciones nuevas.
--
-- Antes el perfil traía hasta 100 resultados de golpe (sin paginar) y los totales salían de los ratings, que aún no se calculan.
-- Ahora el historial llega por páginas, de lo más reciente a lo más antiguo, y el resumen se calcula en la base sin traer las filas.
-- Las rondas NO viajan con la lista: se piden aparte, solo del resultado que se abre.
--
-- Ambas son `security invoker`: corren con los permisos de quien las llama, así que solo ven lo que ya veía un anónimo (los resultados
-- son públicos y los eventos solo si están publicados o finalizados; los de un borrador no aparecen). Un resultado sin lazador ligado
-- (gente que solo existe en la app) nunca sale aquí porque no tiene `roper_id`.
--
-- Orden: por la fecha del evento (si no tiene, por la de captura) y, a igual fecha, por id. El cursor es (fecha, id) del último
-- resultado recibido. Un lazador tiene decenas de resultados, no millones: el índice por `roper_id` que ya existe basta para ordenar.

create or replace function public.public_roper_results(
  p_roper uuid, p_before_date date default null, p_before_id uuid default null, p_limit integer default 20
) returns table (
  id uuid, event_name text, event_slug text, event_date date, event_verified boolean, discipline text,
  time_ms integer, penalty_ms integer, disqualified boolean, place integer, completed_runs integer, nt_count integer, dq_count integer,
  has_rounds boolean
)
  language sql stable security invoker set search_path = ''
  as $$
    select er.id, e.name, e.slug, coalesce(e.event_date, er.created_at::date) as event_date, e.verified, er.discipline,
           er.time_ms, coalesce(er.penalty_ms, 0), er.disqualified, er.place, er.completed_runs, er.nt_count, er.dq_count,
           er.rounds is not null and jsonb_array_length(er.rounds) > 0
    from public.event_results er
    join public.events e on e.id = er.event_id
    where er.roper_id = p_roper
      and (p_before_date is null or p_before_id is null
           or (coalesce(e.event_date, er.created_at::date), er.id) < (p_before_date, p_before_id))
    order by coalesce(e.event_date, er.created_at::date) desc, er.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 101)
  $$;

-- Resumen del lazador: cuántos resultados y eventos, victorias (lugar 1 sin descalificar), mejor lugar y su mejor corrida por modalidad
-- (la corrida regular más rápida, con castigos incluidos, en milisegundos: {"lazo": 5400}). Un lazador sin resultados devuelve ceros.
create or replace function public.public_roper_summary(p_roper uuid)
returns table (results_count integer, events_count integer, wins integer, best_place integer, best_runs jsonb)
  language sql stable security invoker set search_path = ''
  as $$
    with mine as (
      select er.event_id, er.discipline, er.place, er.disqualified, er.rounds
      from public.event_results er join public.events e on e.id = er.event_id
      where er.roper_id = p_roper
    ),
    runs as (
      select m.discipline, min((r.value ->> 'time_ms')::integer + coalesce((r.value ->> 'penalty_ms')::integer, 0)) as best
      from mine m cross join lateral jsonb_array_elements(coalesce(m.rounds, '[]'::jsonb)) as r(value)
      where r.value ->> 'status' = 'completed' and r.value ->> 'kind' = 'regular' and r.value ->> 'stage' in ('preliminary', 'final')
      group by m.discipline
    )
    select (select count(*) from mine)::integer,
           (select count(distinct event_id) from mine)::integer,
           (select count(*) from mine where place = 1 and not disqualified)::integer,
           (select min(place) from mine where place is not null and not disqualified),
           coalesce((select jsonb_object_agg(discipline, best) from runs), '{}'::jsonb)
  $$;

revoke all on function public.public_roper_results(uuid, date, uuid, integer) from public;
revoke all on function public.public_roper_summary(uuid) from public;
grant execute on function public.public_roper_results(uuid, date, uuid, integer) to anon, authenticated;
grant execute on function public.public_roper_summary(uuid) to anon, authenticated;
