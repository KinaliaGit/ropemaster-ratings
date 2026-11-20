-- Avisos dentro de la web (KIN-657). Solo cambios aditivos: una tabla nueva y el reemplazo de private.remove_registration (mismo nombre y firma,
-- los permisos se conservan).
--  * `notifications`: un aviso por persona (cuenta). Guarda una COPIA de lo que importa (nombre y fecha del evento, motivo) para que el aviso siga
--    teniendo sentido aunque el evento se borre después (KIN-660: kind = 'event_deleted').
--  * Solo la persona destinataria lo lee y lo marca como leído (RLS + permiso de columna sobre read_at). Nadie inserta directo: lo hacen las
--    funciones de la base al sacar a alguien o borrar un evento.
--  * Quien no tiene cuenta (perfil creado por el organizador sin reclamar) no recibe aviso en la web; el correo se intenta aparte.
-- Se puede ejecutar más de una vez sin efecto extra.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('removed', 'event_deleted')),
  event_id uuid references public.events(id) on delete set null,
  event_name text not null default '',
  event_date date,
  reason text not null default '',
  refund_pending boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
drop policy if exists "avisos propios (leer)" on public.notifications;
create policy "avisos propios (leer)" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "avisos propios (marcar leído)" on public.notifications;
create policy "avisos propios (marcar leído)" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

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
  -- KIN-657: aviso dentro de la web para la persona sacada (solo si ya tiene cuenta; la guardia de cabecera lo muestra al entrar).
  insert into public.notifications (user_id, kind, event_id, event_name, event_date, reason, refund_pending)
    select ro.user_id, 'removed', reg.event_id, ev.name, ev.event_date, why, reg.payment_status = 'pagado'
    from public.ropers ro, public.events ev where ro.id = reg.roper_id and ro.user_id is not null and ev.id = reg.event_id;
  delete from public.registrations where id = p_registration;
  return rid;
end $$;
revoke all on function private.remove_registration(uuid, text) from public, anon;
grant execute on function private.remove_registration(uuid, text) to authenticated;
