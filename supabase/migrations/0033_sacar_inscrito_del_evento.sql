-- El organizador saca a un inscrito de su evento, con motivo (KIN-621). Solo cambios aditivos: una tabla nueva, tres funciones nuevas y el
-- reemplazo de register_for_event (para respetar el bloqueo de volver a inscribirse).
--
-- Decisiones:
--  * Sacar = borrar la inscripción (se libera el cupo y desaparece de las listas, del conteo y de la API de la app) y dejar un registro en
--    `registration_removals`: quién lo sacó, cuándo, el motivo y cómo estaba el pago en ese momento. El registro no se borra nunca desde la web.
--  * Pagos: no hay reembolso automático (se paga en efectivo o transferencia). Si la inscripción estaba `pagado`, el registro nace con
--    `refund_pending = true`; el organizador lo marca como hecho cuando devuelve el dinero a mano. El participante ve el motivo y ese estado.
--  * Volver a inscribirse: por defecto NO. Quien fue sacado de un evento no puede inscribirse solo en ese evento (en ninguna categoría) hasta que
--    el organizador lo permita (`can_reenroll`). El organizador siempre puede inscribirlo a mano (organizer_enroll no mira este bloqueo).
--  * Quién puede: el organizador activo dueño del evento, o un admin. Un evento finalizado ya no se toca, ni quien ya tiene resultados en él
--    (borrar su inscripción dejaría resultados sin inscrito).
--  * El motivo es obligatorio (3 a 500 caracteres) y lo ve el participante sacado.

create table if not exists public.registration_removals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  roper_id uuid not null references public.ropers(id),
  category_id uuid references public.event_categories(id) on delete set null,
  category_name text not null default '',
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  payment_status text not null,
  payment_method text,
  amount_cents integer not null default 0,
  refund_pending boolean not null default false,
  refund_done_at timestamptz,
  can_reenroll boolean not null default false
);
create index if not exists registration_removals_event_idx on public.registration_removals (event_id, removed_at desc);
create index if not exists registration_removals_roper_idx on public.registration_removals (roper_id);

alter table public.registration_removals enable row level security;
revoke all on public.registration_removals from anon, authenticated;
grant select on public.registration_removals to authenticated;
-- Lo ven: el organizador del evento, un admin y la persona sacada. Nadie escribe directo: solo las funciones de abajo.
drop policy if exists "sacados visibles al organizador, admins y al sacado" on public.registration_removals;
create policy "sacados visibles al organizador, admins y al sacado" on public.registration_removals for select to authenticated
  using (
    roper_id = (select private.current_roper_id())
    or exists (select 1 from public.events e where e.id = registration_removals.event_id and e.organizer_id = (select auth.uid()))
    or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

-- Sacar a un inscrito (una inscripción) de un evento, dejando el motivo. Devuelve el id del registro.
create or replace function private.remove_registration(p_registration uuid, p_reason text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); reg record; is_admin boolean; rid uuid; why text := btrim(coalesce(p_reason, ''));
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  is_admin := exists (select 1 from public.admins a where a.user_id = uid);
  if not is_admin and not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  select r.id, r.event_id, r.roper_id, r.category_id, r.payment_status, r.payment_method, r.amount_cents, e.organizer_id, e.status, c.name as category_name
    into reg
    from public.registrations r join public.events e on e.id = r.event_id left join public.event_categories c on c.id = r.category_id
    where r.id = p_registration for update of r;
  if not found or (reg.organizer_id <> uid and not is_admin) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(why) < 3 or length(why) > 500 then raise exception 'invalid_reason' using errcode = '22023'; end if;
  if reg.status = 'finalizado' then raise exception 'closed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.event_results x where x.event_id = reg.event_id and x.roper_id = reg.roper_id) then
    raise exception 'has_results' using errcode = 'P0001';
  end if;
  insert into public.registration_removals (event_id, roper_id, category_id, category_name, removed_by, reason, payment_status, payment_method, amount_cents, refund_pending)
    values (reg.event_id, reg.roper_id, reg.category_id, coalesce(reg.category_name, ''), uid, why, reg.payment_status, reg.payment_method, reg.amount_cents, reg.payment_status = 'pagado')
    returning id into rid;
  delete from public.registrations where id = p_registration;
  return rid;
end $$;
revoke all on function private.remove_registration(uuid, text) from public, anon;
grant execute on function private.remove_registration(uuid, text) to authenticated;
create or replace function public.remove_registration(p_registration uuid, p_reason text) returns uuid
  language sql set search_path = '' as $$ select private.remove_registration(p_registration, p_reason) $$;
revoke all on function public.remove_registration(uuid, text) from public, anon;
grant execute on function public.remove_registration(uuid, text) to authenticated;

-- El organizador (o un admin) permite o vuelve a bloquear que la persona sacada se inscriba sola otra vez.
create or replace function private.set_removal_reenroll(p_removal uuid, p_allow boolean) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); owner uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select e.organizer_id into owner from public.registration_removals x join public.events e on e.id = x.event_id where x.id = p_removal for update of x;
  if not found or (owner <> uid and not exists (select 1 from public.admins a where a.user_id = uid)) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.admins a where a.user_id = uid) and not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.registration_removals set can_reenroll = coalesce(p_allow, false) where id = p_removal;
end $$;
revoke all on function private.set_removal_reenroll(uuid, boolean) from public, anon;
grant execute on function private.set_removal_reenroll(uuid, boolean) to authenticated;
create or replace function public.set_removal_reenroll(p_removal uuid, p_allow boolean) returns void
  language sql set search_path = '' as $$ select private.set_removal_reenroll(p_removal, p_allow) $$;
revoke all on function public.set_removal_reenroll(uuid, boolean) from public, anon;
grant execute on function public.set_removal_reenroll(uuid, boolean) to authenticated;

-- El organizador (o un admin) marca que ya devolvió el dinero a mano (o lo deshace). Solo aplica si el registro tenía un pago.
create or replace function private.set_removal_refunded(p_removal uuid, p_done boolean) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); owner uuid; pend boolean; done_at timestamptz;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select e.organizer_id, (x.payment_status = 'pagado') into owner, pend from public.registration_removals x join public.events e on e.id = x.event_id where x.id = p_removal for update of x;
  if not found or (owner <> uid and not exists (select 1 from public.admins a where a.user_id = uid)) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.admins a where a.user_id = uid) and not (select private.organizer_active()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not pend then raise exception 'no_payment' using errcode = 'P0001'; end if;
  done_at := case when coalesce(p_done, false) then now() end;
  update public.registration_removals set refund_pending = not coalesce(p_done, false), refund_done_at = done_at where id = p_removal;
end $$;
revoke all on function private.set_removal_refunded(uuid, boolean) from public, anon;
grant execute on function private.set_removal_refunded(uuid, boolean) to authenticated;
create or replace function public.set_removal_refunded(p_removal uuid, p_done boolean) returns void
  language sql set search_path = '' as $$ select private.set_removal_refunded(p_removal, p_done) $$;
revoke all on function public.set_removal_refunded(uuid, boolean) from public, anon;
grant execute on function public.set_removal_refunded(uuid, boolean) to authenticated;

-- Inscribirse: igual que en la 0031 y, además, quien fue sacado del evento no puede volver solo (salvo que el organizador lo permita).
create or replace function private.register_for_event(p_event uuid, p_category uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity, registration_closed, registration_closes_at into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
  if ev.registration_closed or (ev.registration_closes_at is not null and now() >= ev.registration_closes_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.registration_removals where event_id = p_event and roper_id = rid and not can_reenroll) then
    raise exception 'removed' using errcode = 'P0001';
  end if;
  select fee_cents into fee from public.event_categories where id = p_category and event_id = p_event;
  if not found then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if exists (select 1 from public.registrations where event_id = p_event and roper_id = rid and category_id = p_category) then
    raise exception 'already' using errcode = 'P0001';
  end if;
  select count(*) into n from public.registrations where event_id = p_event;
  if ev.capacity is not null and n >= ev.capacity then raise exception 'full' using errcode = 'P0001'; end if;

  insert into public.registrations (event_id, roper_id, category_id, amount_cents) values (p_event, rid, p_category, fee) returning id into reg;
  return reg;
end $$;
