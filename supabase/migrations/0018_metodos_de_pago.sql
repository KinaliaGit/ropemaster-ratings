-- Métodos de pago de la inscripción (efectivo, transferencia y Stripe en línea).
--  * La inscripción nace "pendiente". El organizador del evento la marca "pagado" con el método (efectivo/transferencia) y puede deshacerlo.
--  * Un pago en línea (Stripe) solo lo confirma el servidor con la service role; el organizador no lo puede deshacer.
--  * Las instrucciones de pago del organizador (CLABE, banco, "paga en la arena", etc.) viven en su propia tabla y SOLO las ven el organizador
--    y quienes están inscritos en ese evento (no son públicas como el resto del evento).

alter table registrations add column if not exists payment_method text;
alter table registrations add constraint registrations_payment_method_check check (payment_method is null or payment_method in ('efectivo', 'transferencia', 'stripe'));
alter table registrations add column if not exists paid_at timestamptz;
alter table registrations add column if not exists marked_by uuid references auth.users(id) on delete set null;
create unique index if not exists registrations_provider_payment_key on registrations (provider_payment_id) where provider_payment_id is not null;

create table if not exists event_payment_info (
  event_id uuid primary key references events(id) on delete cascade,
  instructions text not null check (length(btrim(instructions)) > 0 and length(instructions) <= 1000),
  updated_at timestamptz not null default now()
);
alter table event_payment_info enable row level security;
revoke all on event_payment_info from anon, authenticated;
grant select, delete on event_payment_info to authenticated;
grant insert (event_id, instructions, updated_at), update (instructions, updated_at) on event_payment_info to authenticated;
create policy "instrucciones visibles al organizador y a los inscritos" on event_payment_info for select to authenticated
  using (
    exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid()))
    or exists (select 1 from registrations r where r.event_id = event_payment_info.event_id and r.roper_id = (select private.current_roper_id()))
  );
create policy "organizador activo escribe instrucciones" on event_payment_info for insert to authenticated
  with check ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));
create policy "organizador activo edita instrucciones" on event_payment_info for update to authenticated
  using ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())))
  with check ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));
create policy "organizador activo borra instrucciones" on event_payment_info for delete to authenticated
  using ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));

-- El organizador (activo) del evento marca una inscripción como pagada en efectivo o transferencia, o la regresa a pendiente (p_method null).
create or replace function private.set_registration_payment(p_registration uuid, p_method text) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); reg record;
begin
  if uid is null or not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select r.id, r.payment_status, r.payment_method, e.organizer_id into reg
    from public.registrations r join public.events e on e.id = r.event_id where r.id = p_registration for update of r;
  if not found or reg.organizer_id <> uid then raise exception 'not_found' using errcode = 'P0002'; end if;
  if reg.payment_status = 'reembolsado' then raise exception 'refunded' using errcode = 'P0001'; end if;
  if p_method is null then
    if reg.payment_method = 'stripe' then raise exception 'online_payment' using errcode = 'P0001'; end if;  -- un pago en línea no se deshace a mano
    update public.registrations set payment_status = 'pendiente', payment_method = null, paid_at = null, marked_by = uid where id = p_registration;
  elsif p_method in ('efectivo', 'transferencia') then
    if reg.payment_method = 'stripe' then raise exception 'online_payment' using errcode = 'P0001'; end if;
    update public.registrations set payment_status = 'pagado', payment_method = p_method, paid_at = now(), marked_by = uid where id = p_registration;
  else
    raise exception 'invalid_method' using errcode = '22023';
  end if;
end $$;
revoke all on function private.set_registration_payment(uuid, text) from public, anon;
grant execute on function private.set_registration_payment(uuid, text) to authenticated;
create or replace function public.set_registration_payment(p_registration uuid, p_method text) returns void
  language sql set search_path = '' as $$ select private.set_registration_payment(p_registration, p_method) $$;
revoke all on function public.set_registration_payment(uuid, text) from public, anon;
grant execute on function public.set_registration_payment(uuid, text) to authenticated;

-- Confirmación de un pago en línea. SOLO el servidor (service role), desde el webhook de Stripe; idempotente por id de pago.
create or replace function public.confirm_stripe_payment(p_registration uuid, p_payment_id text, p_amount_cents integer) returns void
  language plpgsql security definer set search_path = ''
  as $$
begin
  update public.registrations
     set payment_status = 'pagado', payment_method = 'stripe', provider_payment_id = p_payment_id, paid_at = coalesce(paid_at, now()),
         amount_cents = coalesce(p_amount_cents, amount_cents)
   where id = p_registration and (provider_payment_id is null or provider_payment_id = p_payment_id);
end $$;
revoke all on function public.confirm_stripe_payment(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.confirm_stripe_payment(uuid, text, integer) to service_role;
