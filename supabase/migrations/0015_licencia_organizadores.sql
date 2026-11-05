-- Un organizador solo opera con licencia vigente o con aprobación manual de un administrador (KIN-572).
--   * Licencia vigente => activo (automático, hasta que venza).  * Sin licencia => revisión manual: un admin lo aprueba (organizer_verified).
--   * Sin licencia ni aprobación, o con la licencia vencida => NO puede crear ni editar eventos, categorías, fotos, ni ver el directorio
--     ni registrar participantes. Solo puede ver su cuenta y sus datos.
-- El resultado de la comprobación de la licencia lo escribe SOLO el servidor (service role): estas columnas no son editables desde la API.

alter table profiles add column if not exists license_valid_until timestamptz;  -- 'infinity' = licencia sin vencimiento; null = sin licencia
alter table profiles add column if not exists license_plan text;
alter table profiles add column if not exists license_order_id text;
alter table profiles add column if not exists license_checked_at timestamptz;
create unique index if not exists profiles_license_order_key on profiles (license_order_id) where license_order_id is not null;

-- ¿Quien consulta es un organizador activo (licencia vigente o aprobado a mano)? SECURITY DEFINER para leer su propio perfil sin recursión de reglas.
create or replace function private.organizer_active() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.role = 'organizador'
      and (p.organizer_verified or p.license_valid_until > now())
  ) $$;
revoke all on function private.organizer_active() from public, anon;
grant execute on function private.organizer_active() to authenticated;

-- Participantes y contactos (antes: organizer_verified).
drop policy if exists "organizador verificado registra participantes" on ropers;
create policy "organizador activo registra participantes" on ropers for insert to authenticated
  with check ((select private.organizer_active()));
drop policy if exists "organizador verificado agrega celulares" on roper_contacts;
create policy "organizador activo agrega contactos" on roper_contacts for insert to authenticated
  with check ((select private.organizer_active()));
drop policy if exists "celular visible a su dueño, verificados y admins" on roper_contacts;
create policy "contacto visible a su dueño, organizadores activos y admins" on roper_contacts for select to authenticated
  using (
    roper_id = (select private.current_roper_id())
    or (select private.organizer_active())
    or exists (select 1 from admins a where a.user_id = (select auth.uid()))
  );

-- Eventos, categorías y fotos: solo organizadores activos.
drop policy if exists "organizador crea sus eventos" on events;
create policy "organizador crea sus eventos" on events for insert to authenticated
  with check (organizer_id = (select auth.uid()) and (select private.organizer_active()));
drop policy if exists "organizador edita sus eventos" on events;
create policy "organizador edita sus eventos" on events for update to authenticated
  using (organizer_id = (select auth.uid()) and (select private.organizer_active()))
  with check (organizer_id = (select auth.uid()) and (select private.organizer_active()));

drop policy if exists "dueño gestiona categorías" on event_categories;
create policy "dueño gestiona categorías" on event_categories for all to authenticated
  using ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())))
  with check ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));

drop policy if exists "organizador sube fotos" on event_photos;
create policy "organizador sube fotos" on event_photos for insert to authenticated
  with check ((select private.organizer_active()) and event_id in (select id from events where organizer_id = (select auth.uid())));
drop policy if exists "organizador borra fotos" on event_photos;
create policy "organizador borra fotos" on event_photos for delete to authenticated
  using ((select private.organizer_active()) and event_id in (select id from events where organizer_id = (select auth.uid())));

drop policy if exists "organizador escribe fotos" on storage.objects;
create policy "organizador escribe fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and (select private.organizer_active())
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())));
drop policy if exists "organizador reemplaza fotos" on storage.objects;
create policy "organizador reemplaza fotos" on storage.objects for update to authenticated
  using (bucket_id = 'event-photos' and (select private.organizer_active())
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())))
  with check (bucket_id = 'event-photos' and (select private.organizer_active())
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())));
drop policy if exists "organizador borra archivos de fotos" on storage.objects;
create policy "organizador borra archivos de fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and (select private.organizer_active())
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())));
