-- Un resultado por lazador y por evento, CON sus rondas por dentro (KIN-593, parte web). Solo cambios aditivos.
--
-- Decisiones (2026-11-06):
--  * El resultado es un RESUMEN por lazador y evento: lugar (lo calcula la app, sea round robin o con final), tiempo total, castigos y
--    contadores de corridas. Dentro lleva la lista de rondas que SÍ se intentaron: ronda, etapa (preliminar o final), estado
--    (completed, no_time o disqualified), tiempo y castigo. Lo que no se intentó (pendiente, no se presentó, retirado, saltado) no se manda.
--  * Un no time cuenta como intento fallido: va en las rondas y en `nt_count`.
--  * El rating NO se calcula todavía (KIN-571 y KIN-583, en pausa): esto solo guarda el detalle para cuando se defina la fórmula.
-- Sigue siendo un solo id por resultado: reenviar no duplica y corregir una ronda actualiza el mismo resultado (sube la `revision`).

alter table event_results add column if not exists completed_runs integer;
alter table event_results add column if not exists nt_count integer;
alter table event_results add column if not exists dq_count integer;
alter table event_results add column if not exists rounds jsonb;
alter table event_results add constraint event_results_rounds
  check (rounds is null or (jsonb_typeof(rounds) = 'array' and jsonb_array_length(rounds) <= 20));
alter table event_results add constraint event_results_counts
  check (coalesce(completed_runs, 0) >= 0 and coalesce(nt_count, 0) >= 0 and coalesce(dq_count, 0) >= 0);

-- Valida y normaliza la lista de rondas (ordenada y con las mismas llaves siempre, para poder comparar un reenvío con lo guardado).
-- Devuelve null si no vienen rondas. Cualquier problema levanta el error 22023, que la función de subida convierte en `invalid_field`.
create or replace function public.app_normalize_rounds(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  el jsonb; r integer; s text; st text; t integer; pn integer; seen text[] := '{}'; k text; acc jsonb := '[]'::jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 20 then raise exception 'rondas invalidas' using errcode = '22023'; end if;
  for el in select e.value from jsonb_array_elements(p) as e(value) loop
    if jsonb_typeof(el) <> 'object' then raise exception 'ronda invalida' using errcode = '22023'; end if;
    r := (el ->> 'round')::integer;
    s := coalesce(el ->> 'stage', 'preliminary');
    st := el ->> 'status';
    t := (el ->> 'time_ms')::integer;
    pn := coalesce((el ->> 'penalty_ms')::integer, 0);
    if r is null or r < 1 or r > 20 or s not in ('preliminary', 'final') or st not in ('completed', 'no_time', 'disqualified')
       or pn < 0 or (st = 'completed' and (t is null or t < 0)) or (st <> 'completed' and t is not null) then
      raise exception 'ronda invalida' using errcode = '22023';
    end if;
    k := s || ':' || r;
    if k = any (seen) then raise exception 'ronda repetida' using errcode = '22023'; end if;
    seen := seen || k;
    acc := acc || jsonb_build_array(jsonb_build_object('round', r, 'stage', s, 'status', st, 'time_ms', t, 'penalty_ms', pn));
  end loop;
  select coalesce(jsonb_agg(x.value order by (x.value ->> 'stage') = 'final', (x.value ->> 'round')::integer), '[]'::jsonb)
    into acc from jsonb_array_elements(acc) as x(value);
  return acc;
end $$;
revoke all on function public.app_normalize_rounds(jsonb) from public, anon, authenticated;

-- Misma función de subida de la 0021, ahora con el resumen y las rondas. Si vienen rondas, los contadores (completed_runs, nt_count,
-- dq_count) se calculan de ellas y, si la app también los manda, deben coincidir (si no, invalid_field: así se detecta un error de la app).
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
  v_rounds jsonb; v_completed integer; v_nt integer; v_dqc integer; d_completed integer; d_nt integer; d_dq integer;
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
      v_completed := (item ->> 'completed_runs')::integer;
      v_nt := (item ->> 'nt_count')::integer;
      v_dqc := (item ->> 'dq_count')::integer;
      v_rounds := public.app_normalize_rounds(item -> 'rounds');

      -- Con rondas, los contadores salen de ellas; si la app también los manda, tienen que coincidir.
      if v_rounds is not null then
        select count(*) filter (where x.value ->> 'status' = 'completed')::integer,
               count(*) filter (where x.value ->> 'status' = 'no_time')::integer,
               count(*) filter (where x.value ->> 'status' = 'disqualified')::integer
          into d_completed, d_nt, d_dq from jsonb_array_elements(v_rounds) as x(value);
        if (v_completed is not null and v_completed <> d_completed) or (v_nt is not null and v_nt <> d_nt) or (v_dqc is not null and v_dqc <> d_dq) then
          raise exception 'contadores que no coinciden con las rondas' using errcode = '22023';
        end if;
        v_completed := d_completed; v_nt := d_nt; v_dqc := d_dq;
      end if;

      if v_rev < 1 or v_time < 0 or v_pen < 0 or v_place < 1 or v_completed < 0 or v_nt < 0 or v_dqc < 0
         or (v_dq and v_place is not null) or v_disc = '' or (v_global is null and v_name is null) or length(coalesce(v_name, '')) > 120 then
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
                  and coalesce(cur.penalty_ms, 0) = v_pen and cur.disqualified = v_dq and cur.place is not distinct from v_place
                  and cur.completed_runs is not distinct from v_completed and cur.nt_count is not distinct from v_nt
                  and cur.dq_count is not distinct from v_dqc and cur.rounds is not distinct from v_rounds then
              r_status := 'unchanged'; r_revision := cur.revision;      -- reenvío idéntico: inofensivo aunque el evento esté cerrado
            elsif ev.results_closed_at is not null then
              r_status := 'rejected'; r_code := 'event_closed'; r_message := 'El evento está cerrado: hay que reabrirlo para corregir';
            elsif v_rev > cur.revision then
              update public.event_results er
                 set roper_id = v_global, participant_name = v_name, discipline = v_disc, time_ms = v_time, penalty_ms = v_pen,
                     disqualified = v_dq, place = v_place, completed_runs = v_completed, nt_count = v_nt, dq_count = v_dqc, rounds = v_rounds,
                     revision = v_rev, recorded_at = coalesce(v_rec, er.recorded_at), uploaded_by = p_organizer
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
                                              completed_runs, nt_count, dq_count, rounds, revision, recorded_at, uploaded_by)
            values (v_id, v_event, v_global, v_name, v_disc, v_time, v_pen, v_dq, v_place,
                    v_completed, v_nt, v_dqc, v_rounds, v_rev, v_rec, p_organizer);
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

revoke all on function public.app_upload_results(uuid, jsonb, text[], uuid) from public, anon, authenticated;
grant execute on function public.app_upload_results(uuid, jsonb, text[], uuid) to service_role;
