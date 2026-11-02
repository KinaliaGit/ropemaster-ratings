-- Fotos de eventos (portada y galería). Solo cambios aditivos.

alter table events add column if not exists cover_url text;

create table event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  storage_path text not null,          -- ruta dentro del bucket event-photos
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table event_photos enable row level security;
create policy "fotos públicas" on event_photos for select using (true);
create policy "organizador sube fotos" on event_photos for insert
  with check (event_id in (select id from events where organizer_id = auth.uid()));
create policy "organizador borra fotos" on event_photos for delete
  using (event_id in (select id from events where organizer_id = auth.uid()));

-- Bucket público de lectura; solo el organizador del evento escribe en su carpeta <event_id>/.
insert into storage.buckets (id, name, public) values ('event-photos', 'event-photos', true) on conflict do nothing;
create policy "lectura pública de fotos" on storage.objects for select using (bucket_id = 'event-photos');
create policy "organizador escribe fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos'
    and (storage.foldername(name))[1]::uuid in (select id from events where organizer_id = auth.uid()));
