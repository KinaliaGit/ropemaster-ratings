-- Rating por modalidad (lazo, barriles, ...). Solo cambios aditivos.
-- ropers.rating (0001) queda como valor heredado y ya no se usa.

create table roper_ratings (
  roper_id uuid not null references ropers(id) on delete cascade,
  discipline text not null,                       -- 'lazo' | 'barriles' | ...
  rating numeric not null check (rating >= 1 and rating <= 10),
  events_count integer not null default 0,
  wins integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (roper_id, discipline)
);
create index roper_ratings_rank_idx on roper_ratings (discipline, rating desc);
alter table roper_ratings enable row level security;
create policy "ratings públicos" on roper_ratings for select using (true);

create view public_roper_ratings as
  select r.id as roper_id, r.full_name, rr.discipline, rr.rating, rr.events_count, rr.wins
  from roper_ratings rr join ropers r on r.id = rr.roper_id
  where r.merged_into is null;
grant select on public_roper_ratings to anon, authenticated;
