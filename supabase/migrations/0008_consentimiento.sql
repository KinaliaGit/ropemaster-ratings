-- Constancia de aceptación de Términos y Aviso de Privacidad. Solo cambios aditivos.
create table consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,                       -- versión que aceptó (ver LEGAL.version en src/lib/legal.ts)
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);
alter table consents enable row level security;
create policy "consentimiento propio" on consents for select using (user_id = auth.uid());
-- Se inserta desde el servidor (service role) al crear la cuenta; el usuario no escribe aquí.
