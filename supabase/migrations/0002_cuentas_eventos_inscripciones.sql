-- Dos tipos de cuenta (participante / organizador), eventos publicables,
-- inscripciones y pagos. Solo cambios aditivos sobre 0001.

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('participante', 'organizador')),
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table events
  add column if not exists city text,
  add column if not exists venue text,
  add column if not exists description text,
  add column if not exists disciplines text[] not null default '{}',
  add column if not exists capacity integer,
  add column if not exists status text not null default 'borrador'
    check (status in ('borrador', 'publicado', 'finalizado'));

create table event_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  fee_cents integer not null check (fee_cents >= 0)
);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  roper_id uuid not null references ropers(id),
  category_id uuid references event_categories(id),
  payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente', 'pagado', 'reembolsado')),
  amount_cents integer not null default 0,
  provider_payment_id text,          -- id del cobro en el proveedor de pagos
  created_at timestamptz not null default now(),
  unique (event_id, roper_id, category_id)
);

alter table profiles enable row level security;
alter table event_categories enable row level security;
alter table registrations enable row level security;

-- Público: solo eventos publicados o finalizados (reemplaza la política abierta de 0001).
drop policy if exists "events son públicos" on events;
create policy "eventos publicados son públicos" on events for select
  using (status in ('publicado', 'finalizado') or organizer_id = auth.uid());
create policy "organizador crea sus eventos" on events for insert with check (organizer_id = auth.uid());
create policy "organizador edita sus eventos" on events for update using (organizer_id = auth.uid());

create policy "categorías públicas" on event_categories for select using (true);
create policy "perfil propio" on profiles for select using (user_id = auth.uid());
create policy "inscripciones visibles al dueño" on registrations for select
  using (roper_id in (select id from ropers where user_id = auth.uid())
         or event_id in (select id from events where organizer_id = auth.uid()));
