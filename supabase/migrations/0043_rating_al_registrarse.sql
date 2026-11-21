-- Rating al registrarse (KIN-663). Solo cambios aditivos: una versión nueva de claim_roper / claim_my_roper con rating.
--
-- Decisiones:
--  * Al crear la cuenta de lazador se pide su rating (1 a 10, un decimal). Se guarda en `roper_ratings` para la modalidad `lazo`, con 0 eventos y
--    0 victorias, que es la misma tabla de la que sale el rating en el ranking y en `GET /api/app/participantes` (`ratings.lazo.rating`). Por eso
--    llega a la app y a cada evento sin cambiar el contrato: no hay un segundo lugar donde guardarlo.
--  * Es el rating de PARTIDA. Si el perfil ya tenía un rating en `lazo` (por ejemplo un organizador que registró a esa persona antes y le puso uno),
--    ese gana y el declarado se ignora. La fórmula que lo recalcula con resultados sigue en pausa (KIN-571 y KIN-583).
--  * Nadie lo cambia desde la API: `roper_ratings` no tiene políticas de escritura, solo se escribe con funciones del servidor como esta.
--  * Si la persona ya tenía perfil, no se le toca (igual que el rol en la 0032).

create or replace function private.claim_roper(p_name text, p_role text, p_favorite text, p_rating numeric) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); mail text; rid uuid; rated numeric := round(p_rating, 1);
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role is not null and (
       p_role not in ('header', 'heeler', 'both')
       or (p_role = 'both' and coalesce(p_favorite, '') not in ('header', 'heeler'))
       or (p_role <> 'both' and p_favorite is not null)) then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if p_role is null and p_favorite is not null then raise exception 'invalid_role' using errcode = '22023'; end if;
  if p_rating is not null and (rated < 1 or rated > 10) then raise exception 'invalid_rating' using errcode = '22023'; end if;
  select id into rid from public.ropers where user_id = uid;
  if rid is not null then return rid; end if;   -- ya tiene perfil: no se le cambia el rol ni el rating aquí
  select lower(email) into mail from auth.users where id = uid and email_confirmed_at is not null;
  if mail is null then raise exception 'email_not_confirmed' using errcode = '42501'; end if;
  select r.id into rid from public.roper_contacts c join public.ropers r on r.id = c.roper_id
    where c.email = mail and r.user_id is null and r.merged_into is null for update of r;
  if rid is not null then
    update public.ropers set user_id = uid, primary_role = coalesce(p_role, primary_role), favorite_role = case when p_role is null then favorite_role else p_favorite end where id = rid;
    update public.roper_contacts set claimed = true where roper_id = rid;
  else
    if length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'invalid_name' using errcode = '22023'; end if;
    insert into public.ropers (full_name, user_id, primary_role, favorite_role) values (btrim(p_name), uid, p_role, p_favorite) returning id into rid;
    insert into public.roper_contacts (roper_id, email, claimed) values (rid, mail, true) on conflict do nothing;
  end if;
  if rated is not null then
    insert into public.roper_ratings (roper_id, discipline, rating, events_count, wins) values (rid, 'lazo', rated, 0, 0)
      on conflict (roper_id, discipline) do nothing;
  end if;
  return rid;
end $$;
revoke all on function private.claim_roper(text, text, text, numeric) from public, anon;
grant execute on function private.claim_roper(text, text, text, numeric) to authenticated;

-- La versión de la 0032 (sin rating) pasa a ser un envoltorio de la nueva, para que haya un solo cuerpo que mantener.
create or replace function private.claim_roper(p_name text, p_role text, p_favorite text) returns uuid
  language sql security definer set search_path = '' as $$ select private.claim_roper(p_name, p_role, p_favorite, null::numeric) $$;

create or replace function public.claim_my_roper(p_name text, p_role text, p_favorite text, p_rating numeric) returns uuid
  language sql set search_path = '' as $$ select private.claim_roper(p_name, p_role, p_favorite, p_rating) $$;
revoke all on function public.claim_my_roper(text, text, text, numeric) from public, anon;
grant execute on function public.claim_my_roper(text, text, text, numeric) to authenticated;
