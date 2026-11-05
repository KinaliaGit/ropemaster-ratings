-- Una misma cuenta puede ser organizador Y lazador (el correo es único: una persona = una cuenta).
-- Antes, tener perfil de lazador (claim_my_roper) e inscribirse a eventos exigía que la cuenta fuera de tipo "participante".
-- Ahora basta con tener cuenta y, para inscribirse, un perfil de lazador enlazado. La licencia sigue afectando solo el lado de organizador.

create or replace function private.claim_roper(p_name text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); mail text; rid uuid;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then
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

create or replace function private.register_for_event(p_event uuid, p_category uuid) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); rid uuid; ev record; fee integer; n integer; reg uuid;
begin
  if uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select id into rid from public.ropers where user_id = uid;   -- cualquier cuenta con perfil de lazador (también organizadores)
  if rid is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select id, capacity into ev from public.events where id = p_event and status = 'publicado' for update;
  if not found then raise exception 'closed' using errcode = 'P0001'; end if;
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
