-- Sincronización con la app local de escritorio. Solo cambios aditivos.

alter table profiles add column if not exists stripe_account_id text;  -- cuenta Stripe Connect del organizador
alter table ropers add column if not exists updated_at timestamptz not null default now();
alter table events add column if not exists updated_at timestamptz not null default now();

-- Marca de cambio para la sincronización incremental (?since=).
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger events_touch before update on events for each row execute function touch_updated_at();
create trigger ropers_touch before update on ropers for each row execute function touch_updated_at();

-- Tokens de la app local. Se guarda solo el HASH; el token se muestra una vez al crearlo.
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'App local',
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table api_tokens enable row level security;
create policy "tokens propios" on api_tokens for select using (organizer_id = auth.uid());
