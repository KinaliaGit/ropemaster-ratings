-- Resultados en vivo (KIN-787, H13.6). Cambios aditivos: una tabla nueva y tres funciones nuevas. No toca nada que ya exista.
--
-- QUÉ ES: la app de escritorio manda la "foto" de la ronda que se está corriendo (qué ronda, cuántos equipos ya pasaron, quién está lazando, quiénes faltan
-- en orden de turno y las posiciones). La web la guarda y la sirve a la página pública, que la sondea cada 10-15 s (decisión 7 de KIN-782).
-- Una fila por evento: cada foto REEMPLAZA a la anterior; no hay historial.
--
-- QUIÉN ESCRIBE: solo el servidor (service_role) por `POST /api/app/eventos/<id>/en-vivo`, con la sesión de la app y permiso `results:write`.
-- QUIÉN LEE: nadie lee la tabla directo. La página pública llama a `public.get_live_snapshot`, que solo contesta para un evento publicado o finalizado y PÚBLICO
-- (un borrador o un evento privado contesta lo mismo que uno que no existe: nada). La foto nunca lleva correos, celulares ni pagos: solo nombres y tiempos, que
-- ya son públicos en los resultados.
-- Idempotente por `revision`: una revisión menor o igual a la guardada no cambia nada.

create table if not exists public.event_live_snapshots (
  event_id uuid primary key references public.events(id) on delete cascade,
  revision bigint not null check (revision > 0),
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.event_live_snapshots enable row level security;
revoke all on public.event_live_snapshots from anon, authenticated;

-- Guarda la foto. `outcome`: 'stored' (nueva o más reciente), 'unchanged' (misma revisión: reenvío inofensivo), 'stale' (revisión menor: la web ya tiene una más
-- nueva) y 'not_found' (no existe, es de otro organizador o aún es borrador; no se distingue).
create or replace function public.app_put_live_snapshot(p_organizer uuid, p_event uuid, p_revision bigint, p_snapshot jsonb)
returns table (outcome text, revision bigint)
language plpgsql security definer set search_path = '' as $$
declare ev record; cur bigint;
begin
  select e.organizer_id, e.status into ev from public.events e where e.id = p_event;
  if not found or ev.organizer_id is distinct from p_organizer or ev.status not in ('publicado', 'finalizado') then
    outcome := 'not_found'; revision := null; return next; return;
  end if;
  if p_revision is null or p_revision <= 0 or p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'foto en vivo inválida' using errcode = '22023';
  end if;
  select s.revision into cur from public.event_live_snapshots s where s.event_id = p_event for update;
  if found then
    if cur = p_revision then outcome := 'unchanged'; revision := cur; return next; return; end if;
    if cur > p_revision then outcome := 'stale'; revision := cur; return next; return; end if;
    update public.event_live_snapshots s set revision = p_revision, snapshot = p_snapshot, updated_at = now() where s.event_id = p_event;
  else
    insert into public.event_live_snapshots (event_id, revision, snapshot) values (p_event, p_revision, p_snapshot)
      on conflict (event_id) do update set revision = excluded.revision, snapshot = excluded.snapshot, updated_at = now()
      where public.event_live_snapshots.revision < excluded.revision;
  end if;
  outcome := 'stored'; revision := p_revision; return next;
end $$;

-- Lee la foto de un evento para la página pública. Vacío si no hay foto o si el evento no se puede ver (borrador, privado o inexistente).
-- Trae también el nombre y la arena del evento: son los mismos que ya muestra la página pública.
create or replace function public.get_live_snapshot(p_event uuid)
returns table (revision bigint, snapshot jsonb, updated_at timestamptz, event_name text, venue text, city text)
language sql stable security definer set search_path = '' as $$
  select s.revision, s.snapshot, s.updated_at, e.name, e.venue, e.city
  from public.event_live_snapshots s
  join public.events e on e.id = s.event_id
  where s.event_id = p_event and e.status in ('publicado', 'finalizado') and e.visibility = 'publico'
$$;

revoke all on function public.app_put_live_snapshot(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.app_put_live_snapshot(uuid, uuid, bigint, jsonb) to service_role;
revoke all on function public.get_live_snapshot(uuid) from public;
grant execute on function public.get_live_snapshot(uuid) to anon, authenticated, service_role;
