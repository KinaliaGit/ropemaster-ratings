-- Resultados que sube la app local (KIN-587). Solo cambios aditivos, salvo que `roper_id` deja de ser obligatorio.
--
-- Decisiones (2026-11-06):
--  * Un resultado de alguien SIN lazador en la web se acepta igual: queda solo para el evento, con el nombre que manda la app
--    (`participant_name`), y no se liga a nadie, así que no afecta ratings, perfiles ni historial (todo eso se lee por roper_id).
--  * Los resultados de un evento cerrado no cambian hasta reabrirlo con un motivo. Se usa un candado propio
--    (`events.results_closed_at`): reabrir NO cambia el estado del evento, porque `publicado` es lo que permite inscribirse.
--  * Cada subida y cada cierre o reapertura queda en una bitácora.
-- Todo se escribe SOLO con las funciones de abajo, que ejecuta únicamente el servidor (service role); la API comprueba antes que el
-- código de conexión sea de un organizador activo.

alter table event_results alter column roper_id drop not null;
alter table event_results add column if not exists participant_name text;          -- solo cuando no hay lazador ligado
alter table event_results add column if not exists revision integer not null default 1;
alter table event_results add column if not exists place integer;
alter table event_results add column if not exists recorded_at timestamptz;        -- cuándo se capturó en la app
alter table event_results add column if not exists updated_at timestamptz not null default now();
alter table event_results add column if not exists uploaded_by uuid references auth.users(id) on delete set null;
alter table event_results add constraint event_results_who
  check (roper_id is not null or (participant_name is not null and length(btrim(participant_name)) between 1 and 120));
alter table event_results add constraint event_results_values
  check (revision >= 1 and (time_ms is null or time_ms >= 0) and coalesce(penalty_ms, 0) >= 0
         and (place is null or place >= 1) and (not disqualified or place is null));
create index if not exists event_results_event_idx on event_results (event_id);
drop trigger if exists event_results_touch on event_results;
create trigger event_results_touch before update on event_results for each row execute function touch_updated_at();

-- Nadie escribe resultados directo desde la API pública: solo las funciones de abajo. La lectura sigue siendo pública (0001).
revoke insert, update, delete on event_results from anon, authenticated;

alter table events add column if not exists results_closed_at timestamptz;          -- candado de los resultados; null = abiertos

-- Bitácora de lotes subidos (uno por petición).
create table if not exists result_uploads (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users(id) on delete cascade,
  client_batch_id uuid,
  received integer not null,
  accepted integer not null,
  unchanged integer not null,
  updated integer not null,
  rejected integer not null,
  created_at timestamptz not null default now()
);
create index if not exists result_uploads_organizer_idx on result_uploads (organizer_id, created_at desc);

-- Bitácora de cierres y reaperturas (con el motivo).
create table if not exists event_results_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  organizer_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('close', 'reopen')),
  reason text,
  results_count integer,
  created_at timestamptz not null default now()
);
create index if not exists event_results_log_event_idx on event_results_log (event_id, created_at desc);

alter table result_uploads enable row level security;
alter table event_results_log enable row level security;
revoke all on result_uploads, event_results_log from anon, authenticated;
grant select on result_uploads, event_results_log to authenticated;
create policy "el organizador ve sus subidas" on result_uploads for select to authenticated using (organizer_id = (select auth.uid()));
create policy "el organizador ve la bitácora de sus eventos" on event_results_log for select to authenticated using (organizer_id = (select auth.uid()));

-- Recibe un lote (arreglo json) y devuelve el resultado DE CADA UNO, en el mismo orden:
--   accepted (nuevo), unchanged (ya estaba igual), updated (corrección con `revision` mayor) o rejected (+ code y retry).
-- Un resultado malo no tira a los demás: cada uno corre en su propia subtransacción.
-- Códigos: invalid_field, event_not_found (no existe o no es de este organizador; no se distingue), event_closed, roper_unknown
-- (viene un roper_global_id que no existe), discipline_inactive, stale_revision y temporary_error (la única con retry).
create or replace function public.app_upload_results(
  p_organizer uuid,
  p_results jsonb,
  p_active_disciplines text[],
  p_client_batch uuid
) returns table (r_id text, r_status text, r_code text, r_message text, r_revision integer, r_retry boolean)
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  v_id uuid; v_rev integer; v_event uuid; v_global uuid; v_name text; v_disc text;
  v_time integer; v_pen integer; v_dq boolean; v_place integer; v_rec timestamptz;
  ev record; cur record;
  n_total integer := 0; n_acc integer := 0; n_unc integer := 0; n_upd integer := 0; n_rej integer := 0;
begin
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 200 then
    raise exception 'lote invalido' using errcode = '22023';
  end if;
  for item in select e.value from jsonb_array_elements(p_results) as e(value) loop
    n_total := n_total + 1;
    r_id := coalesce(item ->> 'id', ''); r_status := null; r_code := null; r_message := null; r_revision := null; r_retry := false;
    begin
      v_id := (item ->> 'id')::uuid;
      v_rev := coalesce((item ->> 'revision')::integer, 1);
      v_event := (item ->> 'event_id')::uuid;
      v_global := nullif(item ->> 'roper_global_id', '')::uuid;
      v_name := nullif(btrim(coalesce(item ->> 'participant_name', '')), '');
      v_disc := lower(btrim(coalesce(item ->> 'discipline', '')));
      v_time := (item ->> 'time_ms')::integer;
      v_pen := coalesce((item ->> 'penalty_ms')::integer, 0);
      v_dq := coalesce((item ->> 'disqualified')::boolean, false);
      v_place := (item ->> 'place')::integer;
      v_rec := (item ->> 'recorded_at')::timestamptz;

      if v_rev < 1 or v_time < 0 or v_pen < 0 or v_place < 1 or (v_dq and v_place is not null) or v_disc = ''
         or (v_global is null and v_name is null) or length(coalesce(v_name, '')) > 120 then
        r_status := 'rejected'; r_code := 'invalid_field'; r_message := 'Un campo no cumple las reglas del contrato';
      elsif not (v_disc = any (p_active_disciplines)) then
        r_status := 'rejected'; r_code := 'discipline_inactive'; r_message := 'La modalidad no está activa en la web';
      else
        select e.organizer_id, e.status, e.results_closed_at into ev from public.events e where e.id = v_event;
        if not found or ev.organizer_id is distinct from p_organizer or ev.status not in ('publicado', 'finalizado') then
          r_status := 'rejected'; r_code := 'event_not_found'; r_message := 'El evento no existe o no es tuyo';
        elsif v_global is not null and not exists (select 1 from public.ropers ro where ro.id = v_global and ro.merged_into is null) then
          r_status := 'rejected'; r_code := 'roper_unknown'; r_message := 'roper_global_id no existe en la web';
        else
          -- El nombre solo se guarda cuando no hay lazador ligado.
          if v_global is not null then v_name := null; end if;
          select er.* into cur from public.event_results er where er.id = v_id;
          if found then
            if cur.event_id <> v_event then
              r_status := 'rejected'; r_code := 'invalid_field'; r_message := 'El id ya pertenece a otro evento';
            elsif cur.roper_id is not distinct from v_global and cur.participant_name is not distinct from v_name
                  and cur.discipline = v_disc and cur.time_ms is not distinct from v_time
                  and coalesce(cur.penalty_ms, 0) = v_pen and cur.disqualified = v_dq and cur.place is not distinct from v_place then
              r_status := 'unchanged'; r_revision := cur.revision;      -- reenvío idéntico: inofensivo aunque el evento esté cerrado
            elsif ev.results_closed_at is not null then
              r_status := 'rejected'; r_code := 'event_closed'; r_message := 'El evento está cerrado: hay que reabrirlo para corregir';
            elsif v_rev > cur.revision then
              update public.event_results er
                 set roper_id = v_global, participant_name = v_name, discipline = v_disc, time_ms = v_time, penalty_ms = v_pen,
                     disqualified = v_dq, place = v_place, revision = v_rev, recorded_at = coalesce(v_rec, er.recorded_at), uploaded_by = p_organizer
               where er.id = v_id;
              r_status := 'updated'; r_revision := v_rev;
            else
              r_status := 'rejected'; r_code := 'stale_revision'; r_message := 'Llegó una revisión menor o igual con datos distintos';
              r_revision := cur.revision;
            end if;
          elsif ev.results_closed_at is not null then
            r_status := 'rejected'; r_code := 'event_closed'; r_message := 'El evento está cerrado: hay que reabrirlo para corregir';
          else
            insert into public.event_results (id, event_id, roper_id, participant_name, discipline, time_ms, penalty_ms, disqualified, place,
                                              revision, recorded_at, uploaded_by)
            values (v_id, v_event, v_global, v_name, v_disc, v_time, v_pen, v_dq, v_place, v_rev, v_rec, p_organizer);
            r_status := 'accepted'; r_revision := v_rev;
          end if;
        end if;
      end if;
    exception
      when sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22023' or sqlstate '23514' then
        r_status := 'rejected'; r_code := 'invalid_field'; r_message := 'Un campo no cumple las reglas del contrato'; r_revision := null;
      when others then
        r_status := 'rejected'; r_code := 'temporary_error'; r_message := 'Falla interna al guardar este resultado'; r_revision := null; r_retry := true;
    end;
    if r_status = 'accepted' then n_acc := n_acc + 1;
    elsif r_status = 'unchanged' then n_unc := n_unc + 1;
    elsif r_status = 'updated' then n_upd := n_upd + 1;
    else n_rej := n_rej + 1;
    end if;
    return next;
  end loop;
  insert into public.result_uploads (organizer_id, client_batch_id, received, accepted, unchanged, updated, rejected)
  values (p_organizer, p_client_batch, n_total, n_acc, n_unc, n_upd, n_rej);
end $$;

-- Cierra los resultados de un evento: pasa a `finalizado` y activa el candado. `p_expected` es cuántos resultados tiene la app para
-- ese evento; si la web tiene otra cantidad no se cierra (outcome 'incomplete') para no dejar resultados a medias.
-- Cerrar uno ya cerrado es inofensivo (outcome 'already_closed'). Aquí se conectará el recálculo de ratings (KIN-571 y KIN-583, en pausa).
create or replace function public.app_close_event_results(p_organizer uuid, p_event uuid, p_expected integer)
returns table (outcome text, results_count integer)
language plpgsql security definer set search_path = '' as $$
declare ev record; n integer;
begin
  select e.organizer_id, e.status, e.results_closed_at into ev from public.events e where e.id = p_event for update;
  if not found or ev.organizer_id is distinct from p_organizer or ev.status not in ('publicado', 'finalizado') then
    outcome := 'not_found'; results_count := null; return next; return;
  end if;
  select count(*)::integer into n from public.event_results er where er.event_id = p_event;
  if ev.results_closed_at is not null then
    outcome := 'already_closed'; results_count := n; return next; return;
  end if;
  if p_expected is distinct from n then
    outcome := 'incomplete'; results_count := n; return next; return;
  end if;
  update public.events e set status = 'finalizado', results_closed_at = now() where e.id = p_event;
  insert into public.event_results_log (event_id, organizer_id, action, results_count) values (p_event, p_organizer, 'close', n);
  outcome := 'closed'; results_count := n; return next;
end $$;

-- Reabre los resultados para corregirlos: quita el candado y NO toca el estado (sigue `finalizado`, así nadie puede inscribirse).
-- El motivo es obligatorio y queda en la bitácora. Reabrir uno ya abierto es inofensivo (outcome 'already_open').
create or replace function public.app_reopen_event_results(p_organizer uuid, p_event uuid, p_reason text)
returns table (outcome text, results_count integer)
language plpgsql security definer set search_path = '' as $$
declare ev record; n integer; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select e.organizer_id, e.status, e.results_closed_at into ev from public.events e where e.id = p_event for update;
  if not found or ev.organizer_id is distinct from p_organizer or ev.status not in ('publicado', 'finalizado') then
    outcome := 'not_found'; results_count := null; return next; return;
  end if;
  select count(*)::integer into n from public.event_results er where er.event_id = p_event;
  if ev.results_closed_at is null then
    outcome := 'already_open'; results_count := n; return next; return;
  end if;
  if length(v_reason) < 5 or length(v_reason) > 500 then
    outcome := 'reason_required'; results_count := n; return next; return;
  end if;
  update public.events e set results_closed_at = null where e.id = p_event;
  insert into public.event_results_log (event_id, organizer_id, action, reason, results_count) values (p_event, p_organizer, 'reopen', v_reason, n);
  outcome := 'reopened'; results_count := n; return next;
end $$;

revoke all on function public.app_upload_results(uuid, jsonb, text[], uuid) from public, anon, authenticated;
revoke all on function public.app_close_event_results(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.app_reopen_event_results(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_upload_results(uuid, jsonb, text[], uuid) to service_role;
grant execute on function public.app_close_event_results(uuid, uuid, integer) to service_role;
grant execute on function public.app_reopen_event_results(uuid, uuid, text) to service_role;
