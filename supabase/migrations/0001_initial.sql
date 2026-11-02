-- Esquema inicial: registro global de lazadores.
-- Un perfil (roper) puede existir sin cuenta; la cuenta se "reclama" luego
-- verificando el teléfono por SMS/WhatsApp.

create extension if not exists pgcrypto;

create table ropers (
  id uuid primary key default gen_random_uuid(),          -- global_id
  full_name text not null,
  phone_e164 text,                                         -- teléfono normalizado, NUNCA público
  phone_verified boolean not null default false,
  user_id uuid unique references auth.users(id) on delete set null, -- cuenta que lo reclamó
  merged_into uuid references ropers(id),                  -- si se fusionó con otro perfil
  rating numeric,                                          -- calculado en servidor
  rating_updated_at timestamptz,
  created_at timestamptz not null default now()
);
-- Un mismo teléfono puede tener varios perfiles (ej. padre e hijo).
create index ropers_phone_idx on ropers (phone_e164);
create index ropers_name_idx on ropers (lower(full_name));

-- Alias de identidad: local_id de cada app, id de crossplay, etc.
create table roper_aliases (
  id uuid primary key default gen_random_uuid(),
  roper_id uuid not null references ropers(id) on delete cascade,
  source text not null,          -- 'local' | 'crossplay' | 'merged'
  external_id text not null,
  unique (source, external_id)
);

create table events (
  id uuid primary key,           -- UUID generado por la app, hace idempotente el reenvío
  name text not null,
  event_date date,
  organizer_id uuid references auth.users(id),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table event_results (
  id uuid primary key,           -- UUID generado por la app (idempotencia)
  event_id uuid not null references events(id) on delete cascade,
  roper_id uuid not null references ropers(id),
  discipline text not null,      -- 'lazo' | 'barriles' | ...
  time_ms integer,
  penalty_ms integer default 0,
  disqualified boolean not null default false,
  created_at timestamptz not null default now()
);
create index event_results_roper_idx on event_results (roper_id);

-- Disputas de reclamación de perfil.
create table claim_disputes (
  id uuid primary key default gen_random_uuid(),
  roper_id uuid not null references ropers(id),
  reporter_user_id uuid references auth.users(id),
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

-- RLS: lectura pública solo de columnas no sensibles vía vista.
alter table ropers enable row level security;
alter table roper_aliases enable row level security;
alter table events enable row level security;
alter table event_results enable row level security;
alter table claim_disputes enable row level security;

create view public_ropers as
  select id, full_name, rating, rating_updated_at
  from ropers where merged_into is null;
grant select on public_ropers to anon, authenticated;

create policy "events son públicos" on events for select using (true);
create policy "resultados son públicos" on event_results for select using (true);
