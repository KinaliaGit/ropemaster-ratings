-- Administración de organizadores y directorio con celulares. Solo cambios aditivos (más el reemplazo de 2 políticas de lectura).

-- 1) Administradores. NADIE puede escribir esta tabla desde la web: solo se agregan por SQL
--    (insert into admins (user_id) select id from auth.users where email = '...').
create table admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;
revoke all on admins from anon, authenticated;
grant select on admins to authenticated;
create policy "cada admin se ve a sí mismo" on admins for select to authenticated using (user_id = (select auth.uid()));

-- 2) Auditoría: quién verificó o revocó a quién y cuándo. Solo la escribe la función de abajo; la leen los admins.
create table admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null,
  action text not null check (action in ('verify', 'revoke')),
  created_at timestamptz not null default now()
);
alter table admin_audit enable row level security;
revoke all on admin_audit from anon, authenticated;
grant select on admin_audit to authenticated;
create policy "los admins leen la auditoría" on admin_audit for select to authenticated
  using (exists (select 1 from admins a where a.user_id = (select auth.uid())));

-- 3) El perfil guarda el correo (para que un admin sepa a quién aprueba). Una sola política de lectura: el dueño o un admin.
alter table profiles add column if not exists email text;
grant insert (user_id, role, display_name, email) on profiles to authenticated;
drop policy if exists "perfil propio" on profiles;
create policy "perfil propio o de admin" on profiles for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from admins a where a.user_id = (select auth.uid())));

-- 4) Verificar o revocar a un organizador. La función privada corre con permisos de dueño (porque organizer_verified
--    no es editable por nadie desde la web) pero SOLO si quien llama es admin; la pública es un envoltorio "invoker".
create or replace function private.set_organizer_verified(target uuid, value boolean) returns void
  language plpgsql security definer set search_path = ''
  as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set organizer_verified = value where user_id = target and role = 'organizador';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.admin_audit (admin_id, target_user_id, action)
    values ((select auth.uid()), target, case when value then 'verify' else 'revoke' end);
end $$;
revoke all on function private.set_organizer_verified(uuid, boolean) from public, anon;
grant execute on function private.set_organizer_verified(uuid, boolean) to authenticated;

create or replace function public.admin_set_organizer_verified(target uuid, value boolean) returns void
  language sql set search_path = ''
  as $$ select private.set_organizer_verified(target, value) $$;
revoke all on function public.admin_set_organizer_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_organizer_verified(uuid, boolean) to authenticated;

-- 5) Celulares: el dueño, los organizadores verificados y los admins (una sola política) y formato internacional obligatorio.
drop policy if exists "celular visible a su dueño" on roper_contacts;
drop policy if exists "celular visible a organizadores verificados" on roper_contacts;
create policy "celular visible a su dueño, verificados y admins" on roper_contacts for select to authenticated
  using (
    roper_id = (select private.current_roper_id())
    or exists (select 1 from profiles p where p.user_id = (select auth.uid()) and p.role = 'organizador' and p.organizer_verified)
    or exists (select 1 from admins a where a.user_id = (select auth.uid()))
  );
alter table roper_contacts add constraint roper_contacts_phone_e164 check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

-- 6) Alta de un participante por un organizador verificado, atómica (participante + celular o nada).
--    INVOKER: corren las políticas de siempre (solo verificados pueden insertar en ropers y roper_contacts).
create or replace function public.create_participant(p_name text, p_phone text) returns uuid
  language plpgsql set search_path = ''
  as $$
declare new_id uuid;
begin
  insert into public.ropers (full_name) values (btrim(p_name)) returning id into new_id;
  insert into public.roper_contacts (roper_id, phone_e164) values (new_id, p_phone);
  return new_id;
end $$;
revoke all on function public.create_participant(text, text) from public, anon;
grant execute on function public.create_participant(text, text) to authenticated;
