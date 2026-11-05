-- Fusión de perfiles duplicados (KIN-577). Nunca es automática: solo un administrador fusiona, a mano, y queda registrado.
-- Se conserva TODO el historial: resultados, inscripciones, alias y contacto pasan al perfil que se queda; el perfil viejo queda oculto
-- (`merged_into`) y sus enlaces antiguos redirigen al nuevo (`resolve_roper`). El registro guarda los ids movidos para poder deshacerlo a mano.

create table if not exists roper_merges (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  from_roper uuid not null references ropers(id),
  into_roper uuid not null references ropers(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table roper_merges enable row level security;
revoke all on roper_merges from anon, authenticated;
grant select on roper_merges to authenticated;
create policy "admins leen las fusiones" on roper_merges for select to authenticated
  using (exists (select 1 from admins a where a.user_id = (select auth.uid())));

create or replace function private.merge_ropers(p_from uuid, p_into uuid) returns void
  language plpgsql security definer set search_path = ''
  as $$
declare uid uuid := (select auth.uid()); f record; i record;
  moved_results uuid[]; moved_regs uuid[]; moved_ratings text[]; moved_aliases uuid[];
begin
  if uid is null or not exists (select 1 from public.admins where user_id = uid) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from = p_into then raise exception 'same_profile' using errcode = 'P0001'; end if;
  select * into f from public.ropers where id = p_from for update;
  select * into i from public.ropers where id = p_into for update;
  if f.id is null or i.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if f.merged_into is not null or i.merged_into is not null then raise exception 'already_merged' using errcode = 'P0001'; end if;
  -- Si el viejo ya tiene cuenta y el que se queda no, la cuenta se perdería: el admin debe invertir el orden.
  if f.user_id is not null then raise exception 'from_has_account' using errcode = 'P0001'; end if;

  with m as (update public.event_results set roper_id = p_into where roper_id = p_from returning id) select coalesce(array_agg(id), '{}') into moved_results from m;
  -- Inscripciones: si el que se queda ya está en esa misma categoría del evento, la repetida se queda en el perfil viejo.
  with m as (update public.registrations r set roper_id = p_into where r.roper_id = p_from
      and not exists (select 1 from public.registrations x where x.event_id = r.event_id and x.roper_id = p_into and x.category_id is not distinct from r.category_id)
      returning id) select coalesce(array_agg(id), '{}') into moved_regs from m;
  -- Ratings: se mueve la modalidad que el que se queda no tiene; si ambos la tienen, la del viejo queda guardada en el perfil oculto.
  with m as (update public.roper_ratings r set roper_id = p_into where r.roper_id = p_from
      and not exists (select 1 from public.roper_ratings x where x.roper_id = p_into and x.discipline = r.discipline)
      returning discipline) select coalesce(array_agg(discipline), '{}') into moved_ratings from m;
  with m as (update public.roper_aliases set roper_id = p_into where roper_id = p_from returning id) select coalesce(array_agg(id), '{}') into moved_aliases from m;
  insert into public.roper_aliases (roper_id, source, external_id) values (p_into, 'merged', p_from::text) on conflict do nothing;
  update public.claim_disputes set roper_id = p_into where roper_id = p_from;
  -- Contacto: el correo pasa al que se queda solo si este no tiene uno.
  update public.roper_contacts set roper_id = p_into where roper_id = p_from and not exists (select 1 from public.roper_contacts where roper_id = p_into);
  update public.ropers set merged_into = p_into where id = p_from;

  insert into public.roper_merges (admin_id, from_roper, into_roper, details) values (uid, p_from, p_into,
    jsonb_build_object('results', moved_results, 'registrations', moved_regs, 'ratings', moved_ratings, 'aliases', moved_aliases));
end $$;
revoke all on function private.merge_ropers(uuid, uuid) from public, anon;
grant execute on function private.merge_ropers(uuid, uuid) to authenticated;
create or replace function public.admin_merge_ropers(p_from uuid, p_into uuid) returns void
  language sql set search_path = '' as $$ select private.merge_ropers(p_from, p_into) $$;
revoke all on function public.admin_merge_ropers(uuid, uuid) from public, anon;
grant execute on function public.admin_merge_ropers(uuid, uuid) to authenticated;

-- Enlaces viejos: dado un perfil fusionado devuelve el que se quedó (sigue la cadena); si no está fusionado devuelve el mismo.
create or replace function public.resolve_roper(p_id uuid) returns uuid
  language plpgsql stable security definer set search_path = ''
  as $$
declare cur uuid := p_id; nxt uuid; hops int := 0;
begin
  loop
    select merged_into into nxt from public.ropers where id = cur;
    exit when nxt is null or hops >= 10;
    cur := nxt; hops := hops + 1;
  end loop;
  return cur;
end $$;
revoke all on function public.resolve_roper(uuid) from public;
grant execute on function public.resolve_roper(uuid) to anon, authenticated;
