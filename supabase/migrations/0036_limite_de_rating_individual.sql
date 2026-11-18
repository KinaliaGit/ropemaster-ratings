-- Límite de rating individual del evento (KIN-638). Solo cambios aditivos.
--  * `events.max_roper_rating`: el organizador fija el rating máximo con el que alguien puede inscribirse (NULL = sin límite).
--    Se valida aparte del límite por equipo de la app local (que cuenta la suma de los dos integrantes).
--  * La regla vive en un trigger de `registrations` (no dentro de register_for_event): así vale para cualquier forma de inscribir
--    y no se pierde si esa función se vuelve a definir.
--  * El rating que cuenta es el de las modalidades del evento (el mayor si son varias). Quien aún no tiene rating en esa
--    modalidad parte de 1 (INITIAL_RATING en src/lib/rating.ts).
--  * Un límite nuevo NO saca a quien ya estaba inscrito: solo frena inscripciones nuevas. La app local avisa a quien lo rebase.

alter table public.events add column if not exists max_roper_rating numeric(3,1)
  check (max_roper_rating is null or (max_roper_rating >= 0 and max_roper_rating <= 10));
grant insert (max_roper_rating) on public.events to authenticated;
grant update (max_roper_rating) on public.events to authenticated;

create or replace function private.enforce_registration_rating_limit() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare lim numeric; discs text[]; current_rating numeric;
begin
  select e.max_roper_rating, e.disciplines into lim, discs from public.events e where e.id = new.event_id;
  if lim is null then return new; end if;
  select coalesce(max(rr.rating), 1) into current_rating
    from public.roper_ratings rr
    where rr.roper_id = new.roper_id
      and rr.discipline = any (case when coalesce(cardinality(discs), 0) = 0 then array['lazo'] else discs end);
  if current_rating > lim then raise exception 'rating_limit' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function private.enforce_registration_rating_limit() from public, anon, authenticated;

drop trigger if exists registrations_rating_limit on public.registrations;
create trigger registrations_rating_limit before insert on public.registrations
  for each row execute function private.enforce_registration_rating_limit();
