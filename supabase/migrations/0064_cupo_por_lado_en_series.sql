-- Cupo por lado en la plantilla de las series (KIN-798). Cambios aditivos: dos columnas opcionales y un reemplazo de private.add_series_events.
--  * La plantilla de una serie (lo que se copia a cada evento nuevo) guarda ahora, igual que un evento (0062): `capacity` (total, `null` = sin límite), `capacity_headers` y `capacity_heelers`
--    (tope de cada lado, `null` = sin tope propio; cada uno <= el total). Las series que ya existían quedan igual.
--  * El cupo deja de ser obligatorio en la plantilla: sin cupo, los eventos de la serie nacen sin límite (como los que llegan de la app). Antes `template_incomplete` exigía cupo.
--  * add_series_events copia el cupo por lado a cada evento nuevo. Mismo nombre, firma, errores y permisos; el resto es idéntico a la 0035.
-- Se puede ejecutar más de una vez sin efecto extra.

alter table public.event_series_template add column if not exists capacity_headers integer check (capacity_headers is null or capacity_headers >= 0);
alter table public.event_series_template add column if not exists capacity_heelers integer check (capacity_heelers is null or capacity_heelers >= 0);
alter table public.event_series_template drop constraint if exists event_series_template_capacity_sides_check;
alter table public.event_series_template add constraint event_series_template_capacity_sides_check check (
  capacity is null or ((capacity_headers is null or capacity_headers <= capacity) and (capacity_heelers is null or capacity_heelers <= capacity))
);
grant insert (capacity_headers, capacity_heelers) on public.event_series_template to authenticated;
grant update (capacity_headers, capacity_heelers) on public.event_series_template to authenticated;

create or replace function private.add_series_events(p_series uuid, p_events jsonb, p_publish boolean) returns uuid[]
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); s record; tpl record; item jsonb; ids uuid[] := '{}'; eid uuid; ename text; cat jsonb;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, organizer_id, organizer_name, timezone into s from public.event_series where id = p_series for update;
  if not found or s.organizer_id <> uid then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 or jsonb_array_length(p_events) > 30 then
    raise exception 'invalid_events' using errcode = '22023';
  end if;
  select * into tpl from public.event_series_template where series_id = p_series;
  if not found or coalesce(tpl.city, '') = '' or coalesce(tpl.venue, '') = '' or cardinality(tpl.disciplines) = 0
     or jsonb_array_length(tpl.categories) = 0 then
    raise exception 'template_incomplete' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(p_events) loop
    eid := (item ->> 'id')::uuid;
    ename := btrim(coalesce(item ->> 'name', ''));
    if length(ename) < 1 or length(ename) > 120 or coalesce(item ->> 'slug', '') !~ '^[a-z0-9-]{3,60}$' then
      raise exception 'invalid_events' using errcode = '22023';
    end if;
    insert into public.events (id, slug, name, event_date, city, venue, description, disciplines, capacity, capacity_headers, capacity_heelers, status, organizer_id, organizer_name,
                               timezone, registration_opens_at, series_id)
      values (eid, item ->> 'slug', ename, (item ->> 'date')::date, tpl.city, tpl.venue, '', tpl.disciplines, tpl.capacity, tpl.capacity_headers, tpl.capacity_heelers,
              case when p_publish then 'publicado' else 'borrador' end, uid, s.organizer_name,
              s.timezone, nullif(item ->> 'opens_at', '')::timestamptz, p_series);
    for cat in select * from jsonb_array_elements(tpl.categories) loop
      insert into public.event_categories (event_id, name, fee_cents)
        values (eid, btrim(cat ->> 'name'), greatest(0, coalesce((cat ->> 'fee_cents')::integer, 0)));
    end loop;
    if btrim(tpl.payment_info) <> '' then
      insert into public.event_payment_info (event_id, instructions) values (eid, btrim(tpl.payment_info));
    end if;
    ids := ids || eid;
  end loop;
  return ids;
end $$;
