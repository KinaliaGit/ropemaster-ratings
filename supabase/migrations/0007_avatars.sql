-- Foto de perfil de participantes. Solo cambios aditivos.
alter table ropers add column if not exists avatar_path text;   -- ruta dentro del bucket avatars

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
create policy "lectura pública de avatares" on storage.objects for select using (bucket_id = 'avatars');
-- Cada persona escribe solo en su carpeta <roper_id>/ (el perfil que reclamó).
create policy "participante escribe su avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1]::uuid in (select id from ropers where user_id = auth.uid()));
create policy "participante reemplaza su avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1]::uuid in (select id from ropers where user_id = auth.uid()));
create policy "participante borra su avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1]::uuid in (select id from ropers where user_id = auth.uid()));
