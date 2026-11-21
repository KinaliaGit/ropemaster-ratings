-- Rondas del evento (KIN-655, KIN-653). Solo cambios aditivos, más el reemplazo de app_upload_event (0045, aún sin aplicar en producción).
--
-- Decisiones (2026-11-20):
--  * La app pide el número de rondas al crear cualquier evento casual (por defecto 3) y lo usa para sortear y capturar. La web lo guarda como
--    `events.rounds` (1 a 10, el mismo rango que valida la base de la app: CHECK rounds >= 1 AND rounds <= 10). `null` = el organizador aún no lo define: la app
--    importa su valor por defecto (3), como hasta ahora. Los eventos que ya existían quedan en `null`.
--  * Aplica a los dos tipos de sorteo (round_robin y lazada_sorteada), igual que en la app.
--  * Con resultados ya subidos no se puede cambiar (`rounds_locked`): cambiaría lo que significa cada ronda ya capturada. Con inscritos sí.
--  * Lo que sigue solo en la app (premios, reparto del pozo, reglas de No Time y pantallas): la web no lo consume, así que no se pide.

alter table public.events add column if not exists rounds integer
  check (rounds is null or (rounds >= 1 and rounds <= 10));
grant insert (rounds) on public.events to authenticated;
grant update (rounds) on public.events to authenticated;

create or replace function private.lock_rounds() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.rounds is distinct from old.rounds and exists (select 1 from public.event_results where event_id = old.id) then
    raise exception 'rounds_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.lock_rounds() from public, anon, authenticated;
drop trigger if exists events_lock_rounds on public.events;
create trigger events_lock_rounds before update on public.events
  for each row execute function private.lock_rounds();

-- app_upload_event ahora también guarda `rounds` (p_event.rounds: entero 1 a 10 o null). El resto es idéntico a la 0045.
create or replace function public.app_upload_event(p_organizer uuid, p_series jsonb, p_event jsonb)
returns table (r_event_id uuid, r_event_slug text, r_event_created boolean, r_series_id uuid, r_series_slug text, r_series_created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_app_event uuid := (p_event ->> 'app_id')::uuid;
  v_app_series uuid;
  v_name text; v_org_name text; v_series_tz text; v_series public.event_series; v_event public.events;
  v_serie_creada boolean := false;
begin
  if p_organizer is null then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Dos envíos a la vez del mismo evento (reintento mientras el primero sigue en vuelo) se atienden uno tras otro.
  perform pg_advisory_xact_lock(hashtextextended('app_upload_event:' || p_organizer::text || ':' || v_app_event::text, 0));

  select * into v_event from public.events where organizer_id = p_organizer and app_event_id = v_app_event;
  if found then
    select * into v_series from public.event_series where id = v_event.series_id;
    return query select v_event.id, v_event.slug, false, v_series.id, v_series.slug, false;
    return;
  end if;

  if p_series is not null and jsonb_typeof(p_series) = 'object' then
    v_app_series := (p_series ->> 'app_id')::uuid;
    if nullif(p_series ->> 'id', '') is not null then
      select * into v_series from public.event_series where id = (p_series ->> 'id')::uuid and organizer_id = p_organizer for update;
      if not found then raise exception 'series_not_found' using errcode = 'P0002'; end if;
    else
      select * into v_series from public.event_series where organizer_id = p_organizer and app_series_id = v_app_series for update;
    end if;
    if not found then
      select display_name into v_org_name from public.profiles where user_id = p_organizer and role = 'organizador';
      insert into public.event_series (id, slug, organizer_id, organizer_name, name, description, start_date, end_date, app_series_id)
        values (gen_random_uuid(), p_series ->> 'slug', p_organizer, v_org_name, btrim(p_series ->> 'name'), '',
                (p_series ->> 'start_date')::date, (p_series ->> 'end_date')::date, v_app_series)
        returning * into v_series;
      -- Plantilla vacía: el organizador la completa en la web antes de agregar eventos desde allá.
      insert into public.event_series_template (series_id, city, venue, capacity, disciplines, categories)
        values (v_series.id, '', '', null, '{}', '[]'::jsonb);
      v_serie_creada := true;
    end if;
    v_series_tz := v_series.timezone;
  end if;

  select display_name into v_org_name from public.profiles where user_id = p_organizer and role = 'organizador';
  v_name := btrim(p_event ->> 'name');
  insert into public.events (id, slug, name, event_date, city, venue, description, disciplines, capacity, status, organizer_id, organizer_name,
                             draw_type, lazada_shots_per_package, max_roper_rating, max_team_rating, rounds, series_id, app_event_id, timezone)
    values (gen_random_uuid(), p_event ->> 'slug', v_name, (p_event ->> 'date')::date, '', coalesce(btrim(p_event ->> 'venue'), ''), '',
            array(select jsonb_array_elements_text(p_event -> 'disciplines')), null, 'borrador', p_organizer, v_org_name,
            p_event ->> 'draw_type', nullif(p_event ->> 'shots', '')::integer, nullif(p_event ->> 'max_roper_rating', '')::numeric,
            nullif(p_event ->> 'max_team_rating', '')::numeric, nullif(p_event ->> 'rounds', '')::integer, v_series.id, v_app_event,
            coalesce(v_series_tz, 'America/Mexico_City'))
    returning * into v_event;
  insert into public.event_categories (event_id, name, fee_cents)
    values (v_event.id, 'General', greatest(0, coalesce((p_event ->> 'entry_fee_cents')::integer, 0)));

  return query select v_event.id, v_event.slug, true, v_series.id, v_series.slug, v_serie_creada;
end $$;
revoke all on function public.app_upload_event(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_upload_event(uuid, jsonb, jsonb) to service_role;
