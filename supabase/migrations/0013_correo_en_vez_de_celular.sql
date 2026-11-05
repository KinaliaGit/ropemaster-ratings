-- Ya no se pide el celular: el contacto de un participante es su CORREO.
--  * roper_contacts gana `email` (único, minúsculas) y `phone_e164` pasa a ser opcional (datos heredados).
--  * create_participant recibe nombre y correo.
--  * Los participantes crean cuenta con correo y contraseña y reclaman su perfil por correo (claim_my_roper).
-- Cambios aditivos; solo se relaja NOT NULL de phone_e164 y se reemplaza create_participant (aún sin datos reales).
-- ATENCIÓN antes de lanzar: el reclamo por correo exige correo CONFIRMADO. Con "Confirm email" apagado en Auth, Supabase marca
-- todos los correos como confirmados al registrarse y cualquiera podría reclamar el perfil de otra persona. Encenderlo (KIN-600).

alter table roper_contacts add column if not exists email text;
-- `claimed`: la persona ya creó su cuenta y reclamó el perfil (el organizador lo ve como "Con cuenta").
alter table roper_contacts add column if not exists claimed boolean not null default false;
alter table roper_contacts alter column phone_e164 drop not null;
alter table roper_contacts add constraint roper_contacts_email_fmt
  check (email is null or (email = lower(email) and length(email) <= 200 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));
alter table roper_contacts add constraint roper_contacts_has_contact check (phone_e164 is not null or email is not null);
create unique index if not exists roper_contacts_email_key on roper_contacts (email) where email is not null;
grant insert (roper_id, phone_e164, email) on roper_contacts to authenticated;

-- Alta de un participante por un organizador verificado, atómica (participante + correo o nada). INVOKER: rigen las políticas.
drop function if exists public.create_participant(text, text);
create function public.create_participant(p_name text, p_email text) returns uuid
  language plpgsql set search_path = ''
  as $$
declare new_id uuid;
begin
  insert into public.ropers (full_name) values (btrim(p_name)) returning id into new_id;
  insert into public.roper_contacts (roper_id, email) values (new_id, lower(btrim(p_email)));
  return new_id;
end $$;
revoke all on function public.create_participant(text, text) from public, anon;
grant execute on function public.create_participant(text, text) to authenticated;

-- Los participantes también crean su propio perfil (nunca el de otra persona ni con otro rol).
drop policy if exists "crea su perfil de organizador" on profiles;
create policy "crea su perfil" on profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and role in ('organizador', 'participante'));

-- Reclamo de perfil: une la cuenta del participante con el perfil que un organizador creó con su mismo correo (ya confirmado);
-- si no hay ninguno, crea uno nuevo. SECURITY DEFINER porque ropers.user_id está oculto y no se puede escribir desde la API.
create or replace function private.claim_roper(p_name text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); mail text; rid uuid;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid and role = 'participante') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into rid from public.ropers where user_id = uid;
  if rid is not null then return rid; end if;
  select lower(email) into mail from auth.users where id = uid and email_confirmed_at is not null;
  if mail is null then raise exception 'email_not_confirmed' using errcode = '42501'; end if;
  select r.id into rid from public.roper_contacts c join public.ropers r on r.id = c.roper_id
    where c.email = mail and r.user_id is null and r.merged_into is null for update of r;
  if rid is not null then
    update public.ropers set user_id = uid where id = rid;
    update public.roper_contacts set claimed = true where roper_id = rid;
    return rid;
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = '22023'; end if;
  insert into public.ropers (full_name, user_id) values (btrim(p_name), uid) returning id into rid;
  insert into public.roper_contacts (roper_id, email, claimed) values (rid, mail, true) on conflict do nothing;
  return rid;
end $$;
revoke all on function private.claim_roper(text) from public, anon;
grant execute on function private.claim_roper(text) to authenticated;

create or replace function public.claim_my_roper(p_name text) returns uuid
  language sql set search_path = ''
  as $$ select private.claim_roper(p_name) $$;
revoke all on function public.claim_my_roper(text) from public, anon;
grant execute on function public.claim_my_roper(text) to authenticated;
