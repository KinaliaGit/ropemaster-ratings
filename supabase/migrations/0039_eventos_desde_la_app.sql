-- Eventos que la app crea y sube a la web (KIN-648, entrega 2). Solo cambios aditivos: dos columnas nullable con índice único y una función
-- nueva que solo puede llamar la service role (el endpoint `POST /api/app/eventos`).
--
-- Decisiones (KIN-648, 2026-11-19):
--  * El evento subido por la app nace SIEMPRE como `borrador`: el organizador lo revisa, completa lo que la app no sabe (ciudad, cupo,
--    categorías, instrucciones de pago) y lo publica desde la web. La app nunca publica.
--  * La serie y el evento se suben juntos. Una serie de la app se vincula con la de la web por `app_series_id` (el uuid de la serie en la
--    app), nunca por nombre: si ya existe, se reutiliza; si no, se crea con una plantilla vacía.
--  * Idempotente: el uuid del evento en la app (`app_event_id`) es único por organizador. Reenviar el mismo evento (reintento tras un corte)
--    devuelve el que ya existe y NO lo modifica: después de crearse, la web es la fuente de verdad (inscritos, pagos, ediciones del
--    organizador). Un evento nunca se actualiza desde la app.
--  * La web asigna el id y el slug del evento; la app los guarda como `remote_id` y `remote_slug`.
--  * Lo que la app no tiene queda vacío: `city` = '' (la app solo tiene un campo de lugar, que va a `venue`), `capacity` = null (sin
--    límite) y una categoría "General" con la cuota de la app, para que el evento sea usable en cuanto se publique.

alter table public.events add column if not exists app_event_id uuid;
alter table public.event_series add column if not exists app_series_id uuid;
create unique index if not exists events_app_event_idx on public.events (organizer_id, app_event_id) where app_event_id is not null;
create unique index if not exists event_series_app_series_idx on public.event_series (organizer_id, app_series_id) where app_series_id is not null;
-- Nadie puede escribirlas desde el navegador: no se otorga ni insert ni update a `authenticated` (la service role no necesita grants).
-- Se pueden LEER como cualquier columna de `events` (la tabla tiene select general): es un uuid al azar que genera la app, sin datos personales.

-- p_series: null (evento suelto) o { app_id, slug, name, start_date, end_date } y, si la app ya conoce la serie en la web, también `id`
-- (el id de la serie en la web): con `id` se usa esa serie (debe ser del organizador) y no se crea nada; sin `id` se busca por `app_id`.
-- p_event:  { app_id, slug, name, date, venue, disciplines[], draw_type, shots, max_roper_rating, max_team_rating, entry_fee_cents }.
-- Devuelve una fila: ids y slugs del evento y de la serie, y si cada uno se creó ahora.
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
                             draw_type, lazada_shots_per_package, max_roper_rating, max_team_rating, series_id, app_event_id, timezone)
    values (gen_random_uuid(), p_event ->> 'slug', v_name, (p_event ->> 'date')::date, '', coalesce(btrim(p_event ->> 'venue'), ''), '',
            array(select jsonb_array_elements_text(p_event -> 'disciplines')), null, 'borrador', p_organizer, v_org_name,
            p_event ->> 'draw_type', nullif(p_event ->> 'shots', '')::integer, nullif(p_event ->> 'max_roper_rating', '')::numeric,
            nullif(p_event ->> 'max_team_rating', '')::numeric, v_series.id, v_app_event,
            coalesce(v_series_tz, 'America/Mexico_City'))
    returning * into v_event;
  insert into public.event_categories (event_id, name, fee_cents)
    values (v_event.id, 'General', greatest(0, coalesce((p_event ->> 'entry_fee_cents')::integer, 0)));

  return query select v_event.id, v_event.slug, true, v_series.id, v_series.slug, v_serie_creada;
end $$;
revoke all on function public.app_upload_event(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_upload_event(uuid, jsonb, jsonb) to service_role;
