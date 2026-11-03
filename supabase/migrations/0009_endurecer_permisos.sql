-- Endurece permisos y separa los datos privados (celular) de los públicos.
-- Cambios hechos con la base vacía (aún sin datos reales). Corrige los avisos de `supabase db advisors`.

-- 1) Funciones: ruta de búsqueda fija; y la función de RLS automático de Supabase no debe ser invocable desde la API.
alter function public.touch_updated_at() set search_path = '';
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 2) Organizadores verificados: solo ellos pueden ver celulares y registrar participantes.
--    El campo solo lo cambia un administrador (desde el panel de Supabase o con la service role).
alter table profiles add column if not exists organizer_verified boolean not null default false;

-- Ayudante privado: el id de participante de quien consulta. Vive en un esquema que la API no expone,
-- porque las reglas no pueden leer ropers.user_id (columna oculta a propósito).
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.current_roper_id() returns uuid
  language sql stable security definer set search_path = ''
  as $$ select id from public.ropers where user_id = (select auth.uid()) limit 1 $$;
revoke all on function private.current_roper_id() from public, anon;
grant execute on function private.current_roper_id() to authenticated;

-- 3) El celular sale de `ropers` a una tabla privada. Así `ropers` es pública sin riesgo.
create table roper_contacts (
  roper_id uuid primary key references ropers(id) on delete cascade,
  phone_e164 text not null,
  phone_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index roper_contacts_phone_idx on roper_contacts (phone_e164);
insert into roper_contacts (roper_id, phone_e164, phone_verified)
  select id, phone_e164, phone_verified from ropers where phone_e164 is not null;

drop view if exists public_ropers;
drop view if exists public_roper_ratings;
alter table ropers drop column phone_e164, drop column phone_verified;

-- Lectura pública de ropers solo en columnas no sensibles (user_id y el rating heredado quedan ocultos).
revoke all on ropers from anon, authenticated;
grant select (id, full_name, avatar_path, merged_into, created_at) on ropers to anon, authenticated;
grant insert (full_name) on ropers to authenticated;
grant update (avatar_path) on ropers to authenticated;
create policy "ropers públicos" on ropers for select using (merged_into is null);
create policy "organizador verificado registra participantes" on ropers for insert to authenticated
  with check (exists (select 1 from profiles p where p.user_id = (select auth.uid()) and p.role = 'organizador' and p.organizer_verified));

create policy "dueño cambia su foto" on ropers for update to authenticated
  using (id = (select private.current_roper_id())) with check (id = (select private.current_roper_id()));

alter table roper_contacts enable row level security;
revoke all on roper_contacts from anon, authenticated;
grant select on roper_contacts to authenticated;
grant insert (roper_id, phone_e164) on roper_contacts to authenticated;
create policy "celular visible a organizadores verificados" on roper_contacts for select to authenticated
  using (exists (select 1 from profiles p where p.user_id = (select auth.uid()) and p.role = 'organizador' and p.organizer_verified));
create policy "celular visible a su dueño" on roper_contacts for select to authenticated
  using (roper_id = (select private.current_roper_id()));
create policy "organizador verificado agrega celulares" on roper_contacts for insert to authenticated
  with check (exists (select 1 from profiles p where p.user_id = (select auth.uid()) and p.role = 'organizador' and p.organizer_verified));

-- 4) Perfiles: cada quien crea el suyo como organizador y solo puede editar su nombre (nunca su verificación).
drop policy if exists "perfil propio" on profiles;
revoke all on profiles from anon, authenticated;
grant select on profiles to authenticated;
grant insert (user_id, role, display_name) on profiles to authenticated;
grant update (display_name) on profiles to authenticated;
create policy "perfil propio" on profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "crea su perfil de organizador" on profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and role = 'organizador');
create policy "edita su nombre" on profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 5) Eventos: enlace amigable, nombre del organizador y columnas protegidas (nadie se "verifica" solo).
alter table events add column if not exists slug text unique;
alter table events add column if not exists organizer_name text;
drop policy if exists "eventos publicados son públicos" on events;
drop policy if exists "organizador crea sus eventos" on events;
drop policy if exists "organizador edita sus eventos" on events;
revoke all on events from anon, authenticated;
grant select on events to anon, authenticated;
grant insert (id, name, event_date, city, venue, description, disciplines, capacity, status, slug, organizer_id, organizer_name, cover_url) on events to authenticated;
grant update (name, event_date, city, venue, description, disciplines, capacity, status, cover_url) on events to authenticated;
create policy "eventos publicados son públicos" on events for select
  using (status in ('publicado', 'finalizado') or organizer_id = (select auth.uid()));
create policy "organizador crea sus eventos" on events for insert to authenticated
  with check (organizer_id = (select auth.uid()) and exists (select 1 from profiles p where p.user_id = (select auth.uid()) and p.role = 'organizador'));
create policy "organizador edita sus eventos" on events for update to authenticated
  using (organizer_id = (select auth.uid())) with check (organizer_id = (select auth.uid()));

-- 6) Categorías y fotos: visibles solo si el evento es público o es tuyo; las escribe el dueño del evento.
drop policy if exists "categorías públicas" on event_categories;
revoke all on event_categories from anon, authenticated;
grant select on event_categories to anon, authenticated;
grant insert (event_id, name, fee_cents), update (name, fee_cents), delete on event_categories to authenticated;
create policy "categorías de eventos visibles" on event_categories for select
  using (exists (select 1 from events e where e.id = event_id and (e.status in ('publicado', 'finalizado') or e.organizer_id = (select auth.uid()))));
create policy "dueño gestiona categorías" on event_categories for all to authenticated
  using (exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())))
  with check (exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));

drop policy if exists "fotos públicas" on event_photos;
drop policy if exists "organizador sube fotos" on event_photos;
drop policy if exists "organizador borra fotos" on event_photos;
create policy "fotos de eventos visibles" on event_photos for select
  using (exists (select 1 from events e where e.id = event_id and (e.status in ('publicado', 'finalizado') or e.organizer_id = (select auth.uid()))));
create policy "organizador sube fotos" on event_photos for insert to authenticated
  with check (event_id in (select id from events where organizer_id = (select auth.uid())));
create policy "organizador borra fotos" on event_photos for delete to authenticated
  using (event_id in (select id from events where organizer_id = (select auth.uid())));

-- 7) Resto de políticas: auth.uid() evaluado una vez por consulta (más rápido).
drop policy if exists "inscripciones visibles al dueño" on registrations;
create policy "inscripciones visibles al dueño" on registrations for select to authenticated
  using (roper_id = (select private.current_roper_id())
         or event_id in (select id from events where organizer_id = (select auth.uid())));
drop policy if exists "tokens propios" on api_tokens;
create policy "tokens propios" on api_tokens for select to authenticated using (organizer_id = (select auth.uid()));
drop policy if exists "consentimiento propio" on consents;
create policy "consentimiento propio" on consents for select to authenticated using (user_id = (select auth.uid()));

-- 8) Fotos de perfil (Storage): misma regla, con el ayudante privado (las políticas de 0007 leían ropers.user_id).
drop policy if exists "participante escribe su avatar" on storage.objects;
drop policy if exists "participante reemplaza su avatar" on storage.objects;
drop policy if exists "participante borra su avatar" on storage.objects;
create policy "participante escribe su avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1]::uuid = (select private.current_roper_id()));
create policy "participante reemplaza su avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1]::uuid = (select private.current_roper_id()));
create policy "participante borra su avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1]::uuid = (select private.current_roper_id()));
