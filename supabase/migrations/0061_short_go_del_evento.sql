-- Short-go del evento (KIN-777). Solo cambios aditivos: una columna nueva con valor por defecto y el candado de rondas extendido a ella.
--  * `events.rounds` sigue siendo el TOTAL de rondas del evento e INCLUYE el short-go (3 rondas con short-go = 2 normales + 1 short-go; no se suma una cuarta). Es la misma
--    regla de la app (`event.rounds` + `event.short_go`, su migración 0082): con short-go, la última ronda es el short-go.
--  * `events.short_go` (boolean): si la última de las rondas es el short-go. Por defecto `true`, igual que los eventos de la app: un evento que ya existía (con o sin rondas)
--    se entiende exactamente como hasta ahora y no cambia su número de rondas. Con short-go y rondas definidas, el mínimo es 2 (al menos una normal más el short-go): lo exige
--    el formulario; la base solo lo guarda.
--  * Con resultados ya subidos no se cambia ni `rounds` ni `short_go` (cambiaría lo que significa cada ronda capturada): el candado de la 0046 ahora cubre las dos columnas.
--  * Escribirla es solo del organizador dueño (grants por columna); la lectura pública ya cubre la columna nueva (select a nivel de tabla, 0009).
-- Se puede ejecutar más de una vez sin efecto extra.

alter table public.events add column if not exists short_go boolean not null default true;
grant insert (short_go) on public.events to authenticated;
grant update (short_go) on public.events to authenticated;

create or replace function private.lock_rounds() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.rounds is distinct from old.rounds or new.short_go is distinct from old.short_go) and exists (select 1 from public.event_results where event_id = old.id) then
    raise exception 'rounds_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.lock_rounds() from public, anon, authenticated;
