-- Historial de rating del lazador (KIN-627). Solo cambios aditivos: una tabla, un disparador y una función de lectura.
--
-- La fórmula del rating la define la FMR (KIN-571/583) y su recálculo está en pausa: hoy `roper_ratings` solo guarda el valor ACTUAL.
-- Para poder mostrar «su evolución» sin inventar nada, cada cambio real de `roper_ratings` (alta o cambio de valor, venga de donde venga)
-- deja una fila en `roper_rating_history` con el valor nuevo, el anterior y la fecha. Cuando el recálculo exista, solo tendrá que llenar
-- `event_id` (el evento que movió el rating) para que el perfil diga «tras cuál evento». Hasta entonces el historial arranca vacío: no se
-- reconstruye el pasado ni se inventan valores.
--
--  * Lectura pública, igual que `roper_ratings` (el rating ya es público). Nadie escribe directo: solo el disparador.
--  * Sin cambio de valor no se guarda nada (actualizar events_count o wins no genera historial).
--  * `event_id` se anula si el evento se borra (el valor del rating queda); el evento solo se nombra si es visible (publicado o finalizado).
-- Se puede ejecutar más de una vez sin efecto extra.

create table if not exists public.roper_rating_history (
  id uuid primary key default gen_random_uuid(),
  roper_id uuid not null references public.ropers(id) on delete cascade,
  discipline text not null,
  rating numeric not null,
  previous_rating numeric,
  event_id uuid references public.events(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists roper_rating_history_roper_idx on public.roper_rating_history (roper_id, discipline, recorded_at desc);

alter table public.roper_rating_history enable row level security;
revoke all on public.roper_rating_history from anon, authenticated;
grant select on public.roper_rating_history to anon, authenticated;
drop policy if exists "historial de rating público" on public.roper_rating_history;
create policy "historial de rating público" on public.roper_rating_history for select using (true);

create or replace function private.log_rating_change() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  if tg_op = 'INSERT' then
    insert into public.roper_rating_history (roper_id, discipline, rating, previous_rating) values (new.roper_id, new.discipline, new.rating, null);
  elsif new.rating is distinct from old.rating then
    insert into public.roper_rating_history (roper_id, discipline, rating, previous_rating) values (new.roper_id, new.discipline, new.rating, old.rating);
  end if;
  return new;
end $$;
revoke all on function private.log_rating_change() from public, anon, authenticated;

drop trigger if exists roper_ratings_history on public.roper_ratings;
create trigger roper_ratings_history after insert or update of rating on public.roper_ratings
  for each row execute function private.log_rating_change();

-- Últimos cambios de rating de un lazador (los más recientes primero), con el evento si se conoce.
create or replace function public.public_roper_rating_history(p_roper uuid, p_limit integer default 5)
returns table (discipline text, rating numeric, previous_rating numeric, recorded_at timestamptz, event_name text, event_slug text)
  language sql stable security invoker set search_path = ''
  as $$
    select h.discipline, h.rating, h.previous_rating, h.recorded_at, e.name, e.slug
    from public.roper_rating_history h
    left join public.events e on e.id = h.event_id
    where h.roper_id = p_roper
    order by h.recorded_at desc, h.id desc
    limit least(greatest(coalesce(p_limit, 5), 1), 50)
  $$;
revoke all on function public.public_roper_rating_history(uuid, integer) from public;
grant execute on function public.public_roper_rating_history(uuid, integer) to anon, authenticated;
