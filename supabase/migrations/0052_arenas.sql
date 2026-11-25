-- Arenas como catálogo del organizador (KIN-751). Solo cambios aditivos: una tabla nueva y una columna `arena_id` (nullable) en events y en la
-- plantilla de las series. Nada se borra ni se renombra, y el contrato con la app no cambia (venue y city siguen viajando como texto).
--
-- Decisiones:
--  * Una arena es de UN organizador (no hay catálogo compartido entre organizadores). Tiene nombre, ciudad y notas (dirección, contacto, etc.).
--  * La identidad de una arena es su `key`: el nombre sin mayúsculas, acentos, signos ni espacios repetidos ("Arena X", "arena  x." y "ARENA X"
--    son la misma). Es única por organizador. La misma regla que ya usa la app (KIN-724) para sus sugerencias.
--  * `events.venue` y `events.city` se SIGUEN guardando en el evento (la app y la web pública los leen de ahí). Un trigger los mantiene iguales
--    al nombre y ciudad de su arena: elegir una arena escribe su nombre; renombrar la arena actualiza sus eventos que no han finalizado.
--  * Cualquier camino que cree o edite un evento con solo el texto del lugar (la app, el formulario viejo) queda enlazado solo: se busca la arena
--    del organizador por su `key` y, si no existe, se crea. Por eso no hay que tocar add_series_events ni la subida desde la app.
--  * Unir arenas (merge_arenas) mueve todos sus eventos y plantillas a la que se queda y borra la otra: no se pierde ningún evento. Una arena
--    solo se puede borrar si ningún evento ni serie la usa.
--  * Relleno: se crean las arenas de los lugares que ya existen (por organizador y `key`, con la escritura más usada). El texto de los eventos
--    existentes no se toca, y events.updated_at tampoco (no hay nada nuevo que sincronizar con la app).

-- ---- Llave de comparación ----
create or replace function private.arena_key(p text) returns text
  language sql immutable set search_path = ''
  as $$ select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÇç', 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc')), '[^a-z0-9]+', ' ', 'g')) $$;
revoke all on function private.arena_key(text) from public, anon;
grant execute on function private.arena_key(text) to authenticated;

-- ---- Tabla ----
create table if not exists public.arenas (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  city text not null default '' check (length(city) <= 80),
  notes text not null default '' check (length(notes) <= 500),
  key text not null default '',
  created_at timestamptz not null default now(),
  unique (organizer_id, key)
);
create index if not exists arenas_organizer_idx on public.arenas (organizer_id);

alter table public.events add column if not exists arena_id uuid references public.arenas(id) on delete set null;
alter table public.event_series_template add column if not exists arena_id uuid references public.arenas(id) on delete set null;
create index if not exists events_arena_idx on public.events (arena_id, event_date);
create index if not exists event_series_template_arena_idx on public.event_series_template (arena_id);

-- Nombre limpio y llave al crear o renombrar.
create or replace function private.arenas_set_key() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.city := btrim(coalesce(new.city, ''));
  new.key := private.arena_key(new.name);
  if new.key = '' then raise exception 'invalid_arena' using errcode = '22023'; end if;
  return new;
end $$;
revoke all on function private.arenas_set_key() from public, anon, authenticated;
drop trigger if exists arenas_set_key on public.arenas;
create trigger arenas_set_key before insert or update of name, city on public.arenas
  for each row execute function private.arenas_set_key();

-- ---- Permisos: cada organizador solo ve y cambia las suyas ----
alter table public.arenas enable row level security;
revoke all on public.arenas from anon, authenticated;
grant select, delete on public.arenas to authenticated;
grant insert (id, organizer_id, name, city, notes) on public.arenas to authenticated;
grant update (name, city, notes) on public.arenas to authenticated;
create policy "organizador ve sus arenas" on public.arenas for select to authenticated
  using (organizer_id = (select auth.uid()));
create policy "organizador activo crea sus arenas" on public.arenas for insert to authenticated
  with check (organizer_id = (select auth.uid()) and (select private.organizer_active()));
create policy "organizador activo edita sus arenas" on public.arenas for update to authenticated
  using (organizer_id = (select auth.uid()) and (select private.organizer_active()))
  with check (organizer_id = (select auth.uid()));
create policy "organizador activo borra sus arenas sin uso" on public.arenas for delete to authenticated
  using (organizer_id = (select auth.uid()) and (select private.organizer_active())
         and not exists (select 1 from public.events e where e.arena_id = arenas.id)
         and not exists (select 1 from public.event_series_template t where t.arena_id = arenas.id));

grant insert (arena_id) on public.events to authenticated;
grant update (arena_id) on public.events to authenticated;
grant insert (arena_id) on public.event_series_template to authenticated;
grant update (arena_id) on public.event_series_template to authenticated;

-- ---- Relleno: una arena por cada lugar que ya existe (por organizador y llave) ----
-- Se apaga events_touch solo durante el relleno: enlazar arenas no cambia nada de lo que ve la app.
alter table public.events disable trigger events_touch;
with src as (
  select organizer_id, btrim(venue) as venue, btrim(coalesce(city, '')) as city, private.arena_key(venue) as key
    from public.events where organizer_id is not null and btrim(coalesce(venue, '')) <> ''
  union all
  select s.organizer_id, btrim(t.venue), btrim(coalesce(t.city, '')), private.arena_key(t.venue)
    from public.event_series_template t join public.event_series s on s.id = t.series_id where btrim(coalesce(t.venue, '')) <> ''
), ranked as (
  select organizer_id, key, venue,
         row_number() over (partition by organizer_id, key order by count(*) desc, venue) as rn
    from src where key <> '' group by organizer_id, key, venue
)
insert into public.arenas (organizer_id, name, city)
  select r.organizer_id, left(r.venue, 120),
         left(coalesce((select c.city from src c where c.organizer_id = r.organizer_id and c.key = r.key and c.city <> ''
                        group by c.city order by count(*) desc, c.city limit 1), ''), 80)
    from ranked r where r.rn = 1
  on conflict (organizer_id, key) do nothing;
update public.events e set arena_id = a.id
  from public.arenas a where e.arena_id is null and e.organizer_id = a.organizer_id and a.key = private.arena_key(e.venue);
update public.event_series_template t set arena_id = a.id
  from public.event_series s, public.arenas a
  where t.arena_id is null and s.id = t.series_id and a.organizer_id = s.organizer_id and a.key = private.arena_key(t.venue);
alter table public.events enable trigger events_touch;

-- ---- Mantener evento y arena de acuerdo ----
-- Evento: con arena_id explícito se comprueba que sea del mismo organizador y el evento toma su nombre (y su ciudad, si la arena tiene). Sin
-- arena_id, o si cambió el texto del lugar a otra arena, se busca (o se crea) la arena del organizador por su llave y SOLO se enlaza: el texto del
-- evento no se toca (así lo que sube la app llega igual que se subió).
create or replace function private.events_sync_arena() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare a public.arenas; k text;
begin
  if tg_op = 'UPDATE' and new.arena_id is not distinct from old.arena_id and new.venue is not distinct from old.venue then return new; end if;
  if tg_op = 'UPDATE' and new.arena_id is not null and new.arena_id is not distinct from old.arena_id then
    select * into a from public.arenas where id = new.arena_id;
    if found and a.key = private.arena_key(new.venue) then return new; end if;  -- misma arena, solo cambió la escritura
    new.arena_id := null;                                                      -- cambió el lugar a otra arena: se vuelve a buscar
  end if;
  if new.arena_id is not null then
    select * into a from public.arenas where id = new.arena_id;
    if not found or new.organizer_id is null or a.organizer_id <> new.organizer_id then raise exception 'arena_not_yours' using errcode = '42501'; end if;
    new.venue := a.name;
    if a.city <> '' then new.city := a.city; end if;
    return new;
  end if;
  k := private.arena_key(new.venue);
  if k = '' or new.organizer_id is null then return new; end if;
  select * into a from public.arenas where organizer_id = new.organizer_id and key = k;
  if not found then
    insert into public.arenas (organizer_id, name, city) values (new.organizer_id, left(btrim(new.venue), 120), left(btrim(coalesce(new.city, '')), 80)) returning * into a;
  end if;
  new.arena_id := a.id;
  return new;
end $$;
revoke all on function private.events_sync_arena() from public, anon, authenticated;
drop trigger if exists events_sync_arena on public.events;
create trigger events_sync_arena before insert or update of arena_id, venue on public.events
  for each row execute function private.events_sync_arena();

-- Plantilla de serie: igual, con el organizador de su serie.
create or replace function private.template_sync_arena() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
declare a public.arenas; k text; org uuid;
begin
  if tg_op = 'UPDATE' and new.arena_id is not distinct from old.arena_id and new.venue is not distinct from old.venue then return new; end if;
  select organizer_id into org from public.event_series where id = new.series_id;
  if tg_op = 'UPDATE' and new.arena_id is not null and new.arena_id is not distinct from old.arena_id then
    select * into a from public.arenas where id = new.arena_id;
    if found and a.key = private.arena_key(new.venue) then return new; end if;
    new.arena_id := null;
  end if;
  if new.arena_id is not null then
    select * into a from public.arenas where id = new.arena_id;
    if not found or org is null or a.organizer_id <> org then raise exception 'arena_not_yours' using errcode = '42501'; end if;
    new.venue := a.name;
    if a.city <> '' then new.city := a.city; end if;
    return new;
  end if;
  k := private.arena_key(new.venue);
  if k = '' or org is null then return new; end if;
  select * into a from public.arenas where organizer_id = org and key = k;
  if not found then
    insert into public.arenas (organizer_id, name, city) values (org, left(btrim(new.venue), 120), left(btrim(coalesce(new.city, '')), 80)) returning * into a;
  end if;
  new.arena_id := a.id;
  return new;
end $$;
revoke all on function private.template_sync_arena() from public, anon, authenticated;
drop trigger if exists template_sync_arena on public.event_series_template;
create trigger template_sync_arena before insert or update of arena_id, venue on public.event_series_template
  for each row execute function private.template_sync_arena();

-- Renombrar la arena o cambiarle la ciudad se refleja en sus eventos que no han finalizado y en las plantillas de sus series.
create or replace function private.arenas_propagate() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
begin
  update public.events set venue = new.name, city = case when new.city <> '' then new.city else city end
    where arena_id = new.id and status <> 'finalizado' and (venue is distinct from new.name or (new.city <> '' and city is distinct from new.city));
  update public.event_series_template set venue = new.name, city = case when new.city <> '' then new.city else city end
    where arena_id = new.id and (venue is distinct from new.name or (new.city <> '' and city is distinct from new.city));
  return null;
end $$;
revoke all on function private.arenas_propagate() from public, anon, authenticated;
drop trigger if exists arenas_propagate on public.arenas;
create trigger arenas_propagate after update of name, city on public.arenas
  for each row execute function private.arenas_propagate();

-- ---- Unir dos arenas ----
-- Todo lo de `p_drop` pasa a `p_keep` (los eventos toman su nombre y ciudad) y `p_drop` se borra. Las dos deben ser del organizador que llama.
create or replace function private.merge_arenas(p_keep uuid, p_drop uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); n integer;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then raise exception 'same_arena' using errcode = '22023'; end if;
  perform 1 from public.arenas where id in (p_keep, p_drop) and organizer_id = uid order by id for update;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.events set arena_id = p_keep where arena_id = p_drop;
  update public.event_series_template set arena_id = p_keep where arena_id = p_drop;
  delete from public.arenas where id = p_drop;
end $$;
revoke all on function private.merge_arenas(uuid, uuid) from public, anon;
grant execute on function private.merge_arenas(uuid, uuid) to authenticated;
create or replace function public.merge_arenas(p_keep uuid, p_drop uuid) returns void
  language sql set search_path = '' as $$ select private.merge_arenas(p_keep, p_drop) $$;
revoke all on function public.merge_arenas(uuid, uuid) from public, anon;
grant execute on function public.merge_arenas(uuid, uuid) to authenticated;
