-- Fotos reales en Supabase Storage (perfil y eventos). Solo cambios aditivos.

-- 1) El id de participante de quien consulta. Es INVOKER (corre con los permisos de quien llama) y delega en la
--    función privada de 0009; así la web puede construir la ruta de su carpeta (<roper_id>/...) sin leer ropers.user_id.
create or replace function public.my_roper_id() returns uuid
  language sql stable set search_path = ''
  as $$ select private.current_roper_id() $$;
revoke all on function public.my_roper_id() from public, anon;
grant execute on function public.my_roper_id() to authenticated;

-- 2) Fotos de evento: el dueño puede subir, reemplazar y borrar los archivos de la carpeta <event_id>/ de SUS eventos.
--    (0004 solo permitía subir; sin borrar quedarían archivos huérfanos al reemplazar o eliminar una foto.)
drop policy if exists "organizador escribe fotos" on storage.objects;
create policy "organizador escribe fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())));
create policy "organizador reemplaza fotos" on storage.objects for update to authenticated
  using (bucket_id = 'event-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())))
  with check (bucket_id = 'event-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())));
create policy "organizador borra archivos de fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos'
    and (storage.foldername(name))[1]::uuid in (select id from public.events where organizer_id = (select auth.uid())));

-- 3) Defensa en profundidad: los buckets mismos rechazan archivos grandes o que no sean imágenes.
--    La web ya reduce y valida antes de subir; esto cubre a quien llame a Storage directo con su sesión.
update storage.buckets set file_size_limit = 307200,  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'avatars';
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'event-photos';
