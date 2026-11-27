-- Ciclo de vida y visibilidad de los eventos (KIN-769, entrega A). Cambios aditivos: una columna nueva con valor por defecto compatible, dos funciones nuevas y
-- el reemplazo (mismo nombre y firma, los permisos se conservan) de tres políticas de lectura y de cinco funciones públicas de inscritos y conteos.
--
-- MODELO (decidido con Edgar): DOS propiedades distintas.
--  * `events.status` (ciclo de vida) NO cambia: borrador -> publicado -> finalizado.
--  * `events.visibility` (visibilidad, NUEVA): 'publico' (por defecto) o 'privado'. Todos los eventos que ya existen quedan 'publico': nada cambia para ellos.
-- Un borrador nunca se ve fuera de su organizador, sea público o privado. La visibilidad solo importa en un evento publicado o finalizado.
--
-- QUIÉN VE UN EVENTO PRIVADO: su organizador y quien ya está inscrito o en la lista de espera. Para cualquier otra persona (sin sesión, otro
-- participante, otro organizador) el evento NO existe: ni en listados, búsquedas, categorías, fotos, resultados, conteos ni por su dirección. Lo de invitar
-- correos y el acceso por enlace es de KIN-753 (la decide Neaves) y se sumará dentro de `public.can_view_event`, el único lugar de la regla.
-- Mientras tanto nadie puede inscribirse a un evento privado (no se ve, así que no hay cómo): primero hace falta la invitación.
--
-- FINALIZACIÓN AUTOMÁTICA: un evento 'publicado' cuya fecha ya pasó (en SU zona horaria) cuenta como 'finalizado' aunque nadie lo cierre. Se calcula al leer
-- (sin tarea programada, así nunca queda desfasado) con `public.event_phase`, que es la misma regla que `statusByDate` en src/lib/event-time.ts.
--
-- SEGURIDAD: `visibility` NO se puede escribir desde la web (ni insert ni update para `authenticated`); solo el servidor y el administrador de la base. El
-- permiso se agregará cuando exista la interfaz y la lista de invitados (KIN-753). Así esta migración no cambia nada para nadie hasta entonces.
-- Se puede ejecutar más de una vez sin efecto extra.

-- ---- Visibilidad: columna nueva, aditiva y con valor por defecto compatible ----
alter table public.events add column if not exists visibility text not null default 'publico';
alter table public.events drop constraint if exists events_visibility_check;
alter table public.events add constraint events_visibility_check check (visibility in ('publico', 'privado'));

-- ---- Fase del evento: la regla de finalización automática, en un solo lugar de SQL ----
-- Misma regla que `statusByDate` (src/lib/event-time.ts): publicado y con fecha anterior a HOY en la zona del evento = finalizado; lo demás, su estado.
create or replace function public.event_phase(p_status text, p_event_date date, p_timezone text) returns text
  language sql stable set search_path = ''
  as $$
    select case when p_status = 'publicado' and p_event_date is not null and p_event_date < (now() at time zone p_timezone)::date then 'finalizado' else p_status end
  $$;
revoke all on function public.event_phase(text, date, text) from public;
grant execute on function public.event_phase(text, date, text) to anon, authenticated;

-- ---- ¿Esta persona puede ver este evento? El único lugar de la regla ----
-- Vive en `public` porque las políticas de lectura pública la llaman y quien no tiene sesión no puede entrar al esquema `private`. Solo contesta sí o no
-- para quien pregunta (nunca revela nada de otro evento): para un evento que no existe o que no puede ver, contesta lo mismo, no.
create or replace function public.can_view_event(p_organizer uuid, p_status text, p_visibility text, p_event uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select case
      when coalesce(p_organizer = (select auth.uid()), false) then true                    -- su organizador, siempre
      when p_status not in ('publicado', 'finalizado') then false                          -- un borrador solo lo ve su organizador
      when p_visibility = 'publico' then true
      else exists (select 1 from public.registrations r where r.event_id = p_event and r.roper_id = (select private.current_roper_id()))
        or exists (select 1 from public.event_waitlist w where w.event_id = p_event and w.roper_id = (select private.current_roper_id()))
    end
  $$;
revoke all on function public.can_view_event(uuid, text, text, uuid) from public;
grant execute on function public.can_view_event(uuid, text, text, uuid) to anon, authenticated;

-- ---- Lectura: eventos, categorías y fotos ----
-- Un evento público se decide con la columna sola (rápido); la función solo se llama para los privados.
drop policy if exists "eventos publicados son públicos" on public.events;
create policy "eventos publicados son públicos" on public.events for select
  using (
    organizer_id = (select auth.uid())
    or (status in ('publicado', 'finalizado') and (visibility = 'publico' or public.can_view_event(organizer_id, status, visibility, id)))
  );

-- Categorías y fotos siguen al evento: se ven si el evento se ve (la consulta a `events` ya pasa por la política de arriba). Resultados y series ya hacían esto.
drop policy if exists "categorías de eventos visibles" on public.event_categories;
create policy "categorías de eventos visibles" on public.event_categories for select
  using (exists (select 1 from public.events e where e.id = event_categories.event_id));
drop policy if exists "fotos de eventos visibles" on public.event_photos;
create policy "fotos de eventos visibles" on public.event_photos for select
  using (exists (select 1 from public.events e where e.id = event_photos.event_id));

-- ---- Funciones públicas de inscritos y conteos (saltan RLS): ahora respetan la visibilidad ----
create or replace function public.event_enrolled(p_slug text) returns integer
  language sql stable security definer set search_path = ''
  as $$ select count(*)::integer from public.registrations r join public.events e on e.id = r.event_id
        where e.slug = p_slug and e.status in ('publicado', 'finalizado')
          and (e.visibility = 'publico' or public.can_view_event(e.organizer_id, e.status, e.visibility, e.id)) $$;

create or replace function public.event_registrants(p_event uuid) returns table(roper_id uuid, category_id uuid)
  language sql stable security definer set search_path = ''
  as $$ select r.roper_id, r.category_id from public.registrations r join public.events e on e.id = r.event_id
        join public.ropers p on p.id = r.roper_id and p.merged_into is null
        where r.event_id = p_event and e.status in ('publicado', 'finalizado')
          and (e.visibility = 'publico' or public.can_view_event(e.organizer_id, e.status, e.visibility, e.id)) order by r.created_at $$;

create or replace function public.event_registrants_page(p_event uuid, p_discipline text, p_initial numeric, p_after_at timestamptz default null, p_after_id uuid default null, p_limit integer default 30)
  returns table(roper_id uuid, full_name text, avatar_path text, rating numeric, events_count integer, wins integer, is_initial boolean, enrolled_at timestamptz)
  language sql stable security definer set search_path = ''
  as $$
    with firsts as (
      select r.roper_id, min(r.created_at) as enrolled_at
      from public.registrations r join public.events e on e.id = r.event_id
      where r.event_id = p_event and e.status in ('publicado', 'finalizado')
        and (e.visibility = 'publico' or public.can_view_event(e.organizer_id, e.status, e.visibility, e.id))
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

create or replace function public.event_registration_counts() returns table(event_id uuid, n integer)
  language sql stable security definer set search_path = ''
  as $$ select r.event_id, count(*)::integer from public.registrations r join public.events e on e.id = r.event_id
        where e.status in ('publicado', 'finalizado')
          and (e.visibility = 'publico' or public.can_view_event(e.organizer_id, e.status, e.visibility, e.id)) group by r.event_id $$;

create or replace function public.event_waitlist_counts() returns table(event_id uuid, n integer)
  language sql stable security definer set search_path = ''
  as $$ select w.event_id, count(*)::integer from public.event_waitlist w join public.events e on e.id = w.event_id
        where e.status = 'publicado'
          and (e.visibility = 'publico' or public.can_view_event(e.organizer_id, e.status, e.visibility, e.id)) group by w.event_id $$;

-- ---- Escritura: nadie entra a un evento que no puede ver ----
-- Inscribirse y entrar a la lista de espera se hacen con funciones que saltan RLS (register_for_event, join_waitlist y sus variantes). En vez de tocar cada una,
-- la regla va como guarda en las dos tablas: quien tiene sesión solo puede insertar en un evento que puede ver (su propio evento o uno público). Sin sesión
-- (el servidor y la app) no aplica. El organizador que inscribe a mano ve su propio evento, así que sigue pudiendo.
create or replace function private.guard_event_insert() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare ev record;
begin
  if (select auth.uid()) is null then return new; end if;
  select e.organizer_id, e.status, e.visibility into ev from public.events e where e.id = new.event_id;
  if found and ev.visibility <> 'publico' and not public.can_view_event(ev.organizer_id, ev.status, ev.visibility, new.event_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return new;
end $$;
revoke all on function private.guard_event_insert() from public, anon, authenticated;
drop trigger if exists registrations_guard_event on public.registrations;
create trigger registrations_guard_event before insert on public.registrations for each row execute function private.guard_event_insert();
drop trigger if exists event_waitlist_guard_event on public.event_waitlist;
create trigger event_waitlist_guard_event before insert on public.event_waitlist for each row execute function private.guard_event_insert();
