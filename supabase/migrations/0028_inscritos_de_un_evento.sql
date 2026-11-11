-- Conteo de UN evento e inscritos paginados (KIN-612). Solo cambios aditivos: dos funciones nuevas. Las anteriores
-- (event_registration_counts y event_registrants, de la 0014) se quedan: la portada sigue usando el conteo de todos los eventos.
--
-- Antes, abrir un evento calculaba los inscritos de TODOS los eventos para mostrar uno, y la lista de inscritos se leía en tres
-- consultas seguidas (ids, perfiles y luego el dibujo), completa y sin paginar. Ahora el conteo es solo del evento que se ve, y la lista
-- llega por páginas y ya con el nombre, la foto y el rating de la modalidad del evento, en una sola consulta.
--
-- Son `security definer` por lo mismo que las de la 0014: la tabla de inscripciones no es pública. Solo responden por eventos publicados
-- o finalizados, y solo devuelven lo que ya es público del perfil (nombre, foto y rating). Nunca pagos, correo ni celular.

create or replace function public.event_enrolled(p_slug text) returns integer
  language sql stable security definer set search_path = ''
  as $$ select count(*)::integer from public.registrations r join public.events e on e.id = r.event_id
        where e.slug = p_slug and e.status in ('publicado', 'finalizado') $$;

-- Inscritos de un evento, de los primeros a los últimos en inscribirse (sin repetir a quien está en dos categorías).
-- p_discipline / p_initial: modalidad del evento y rating inicial de quien aún no tiene uno (como en el ranking).
-- Cursor: (enrolled_at, roper_id) del último recibido. Los perfiles fusionados no salen (igual que en event_registrants).
create or replace function public.event_registrants_page(
  p_event uuid, p_discipline text, p_initial numeric, p_after_at timestamptz default null, p_after_id uuid default null, p_limit integer default 30
) returns table (roper_id uuid, full_name text, avatar_path text, rating numeric, events_count integer, wins integer, is_initial boolean, enrolled_at timestamptz)
  language sql stable security definer set search_path = ''
  as $$
    with firsts as (
      select r.roper_id, min(r.created_at) as enrolled_at
      from public.registrations r join public.events e on e.id = r.event_id
      where r.event_id = p_event and e.status in ('publicado', 'finalizado')
      group by r.roper_id
    )
    select p.id, p.full_name, p.avatar_path, coalesce(rr.rating, p_initial), coalesce(rr.events_count, 0), coalesce(rr.wins, 0),
           rr.roper_id is null, f.enrolled_at
    from firsts f
    join public.ropers p on p.id = f.roper_id and p.merged_into is null
    left join public.roper_ratings rr on rr.roper_id = p.id and rr.discipline = p_discipline
    where p_after_at is null or p_after_id is null or (f.enrolled_at, p.id) > (p_after_at, p_after_id)
    order by f.enrolled_at, p.id
    limit least(greatest(coalesce(p_limit, 30), 1), 101)
  $$;

revoke all on function public.event_enrolled(text) from public;
revoke all on function public.event_registrants_page(uuid, text, numeric, timestamptz, uuid, integer) from public;
grant execute on function public.event_enrolled(text) to anon, authenticated;
grant execute on function public.event_registrants_page(uuid, text, numeric, timestamptz, uuid, integer) to anon, authenticated;
