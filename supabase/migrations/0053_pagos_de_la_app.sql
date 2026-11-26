-- Pagos que sube la app local (KIN-706). Solo cambios aditivos en `registrations` y una bitácora nueva.
--
-- La app lleva los pagos como abonos (varios pagos por persona, con forma de pago y nota). La web guarda UN estado por inscripción;
-- por eso la app sube un RESUMEN por inscripción: cuánto lleva pagado, cuánto debe, la forma del último pago, la fecha, la nota y,
-- si alguien más pagó por esa persona, quién. Reglas:
--  * Una persona puede tener VARIAS inscripciones en un evento (otra categoría, o los dos roles). El pago de la app es el total de la
--    persona: estado, forma, nota y quién pagó se aplican a todas, y lo pagado se reparte entre ellas en orden de inscripción hasta el
--    costo de cada una (el sobrante queda en la última), para que sumarlas dé lo que la app dijo, sin duplicar.
--  * Un pago en línea (Stripe) manda: esa inscripción no se toca y su costo se descuenta de lo repartido. Si todas las que quedan se
--    pagaron en línea y la app dice otra cosa, se rechaza (`paid_online`). Lo demás (efectivo y transferencia) se corrige con
--    `revision` mayor, igual que los resultados.
--  * Una inscripción reembolsada no se toca; si todas lo están, se rechaza (`refunded`).
--  * Se escribe SOLO con la función de abajo, que ejecuta únicamente el servidor (service role); la API comprueba antes que el
--    token sea de un organizador activo.

alter table registrations add column if not exists amount_paid_cents integer;
alter table registrations add column if not exists payment_note text;
alter table registrations add column if not exists paid_by_roper_id uuid references ropers(id) on delete set null;
alter table registrations add column if not exists payment_revision integer not null default 0;
alter table registrations add constraint registrations_payment_values
  check ((amount_paid_cents is null or amount_paid_cents >= 0) and payment_revision >= 0
         and (payment_note is null or length(payment_note) <= 500));

-- Bitácora de lotes de pagos subidos (uno por petición).
create table if not exists payment_uploads (
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
create index if not exists payment_uploads_organizer_idx on payment_uploads (organizer_id, created_at desc);
alter table payment_uploads enable row level security;
revoke all on payment_uploads from anon, authenticated;
grant select on payment_uploads to authenticated;
create policy "el organizador ve sus subidas de pagos" on payment_uploads for select to authenticated using (organizer_id = (select auth.uid()));

-- Recibe un lote (arreglo json) y devuelve el resultado DE CADA UNO, en el mismo orden:
--   accepted (la web cambió), unchanged (ya estaba igual), updated (corrección con `revision` mayor) o rejected (+ code y retry).
-- Un pago malo no tira a los demás: cada uno corre en su propia subtransacción.
-- Códigos: invalid_field, event_not_found (no existe o no es de este organizador; no se distingue), registration_not_found (esa persona
-- no está inscrita en el evento), roper_unknown (`paid_by_global_id` que no existe), paid_online, refunded, stale_revision y
-- temporary_error (la única con retry).
create or replace function public.app_upload_payments(
  p_organizer uuid,
  p_payments jsonb,
  p_client_batch uuid
) returns table (r_id text, r_status text, r_code text, r_message text, r_revision integer, r_retry boolean)
language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  v_event uuid; v_global uuid; v_by uuid; v_status text; v_method text; v_paid integer; v_note text; v_paid_at timestamptz; v_rev integer;
  ev record; reg record; v_parts jsonb; v_same boolean;
  n_total integer := 0; n_acc integer := 0; n_unc integer := 0; n_upd integer := 0; n_rej integer := 0;
begin
  if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments) > 200 then
    raise exception 'lote invalido' using errcode = '22023';
  end if;
  for item in select e.value from jsonb_array_elements(p_payments) as e(value) loop
    n_total := n_total + 1;
    r_id := coalesce(item ->> 'id', ''); r_status := null; r_code := null; r_message := null; r_revision := null; r_retry := false;
    begin
      perform (item ->> 'id')::uuid;
      v_rev := coalesce((item ->> 'revision')::integer, 1);
      v_event := (item ->> 'event_id')::uuid;
      v_global := (item ->> 'roper_global_id')::uuid;
      v_by := nullif(item ->> 'paid_by_global_id', '')::uuid;
      v_status := lower(btrim(coalesce(item ->> 'status', '')));
      v_method := nullif(lower(btrim(coalesce(item ->> 'method', ''))), '');
      v_paid := (item ->> 'paid_cents')::integer;
      v_note := nullif(btrim(coalesce(item ->> 'note', '')), '');
      v_paid_at := (item ->> 'paid_at')::timestamptz;

      if v_rev < 1 or v_paid is null or v_paid < 0 or length(coalesce(v_note, '')) > 500
         or v_status not in ('pagado', 'pendiente')
         or (v_status = 'pagado' and v_method is null) or (v_status = 'pendiente' and v_method is not null)
         or (v_method is not null and v_method not in ('efectivo', 'transferencia')) then
        r_status := 'rejected'; r_code := 'invalid_field'; r_message := 'Un campo no cumple las reglas del contrato';
      else
        select e.organizer_id into ev from public.events e where e.id = v_event;
        if not found or ev.organizer_id is distinct from p_organizer then
          r_status := 'rejected'; r_code := 'event_not_found'; r_message := 'El evento no existe o no es tuyo';
        elsif v_by is not null and not exists (select 1 from public.ropers ro where ro.id = v_by and ro.merged_into is null) then
          r_status := 'rejected'; r_code := 'roper_unknown'; r_message := 'paid_by_global_id no existe en la web';
        else
          -- Se bloquean todas las inscripciones de la persona en el evento antes de decidir.
          perform 1 from public.registrations r where r.event_id = v_event and r.roper_id = v_global order by r.id for update;
          select count(*) as total,
                 count(*) filter (where r.payment_status <> 'reembolsado' and r.payment_method = 'stripe') as online,
                 count(*) filter (where r.payment_status <> 'reembolsado' and r.payment_method is distinct from 'stripe') as manual,
                 coalesce(sum(r.amount_cents) filter (where r.payment_status <> 'reembolsado' and r.payment_method = 'stripe'), 0) as online_cents,
                 coalesce(max(r.payment_revision) filter (where r.payment_status <> 'reembolsado' and r.payment_method is distinct from 'stripe'), 0) as manual_revision,
                 coalesce(max(r.payment_revision), 0) as revision
            into reg
            from public.registrations r
           where r.event_id = v_event and r.roper_id = v_global;
          if reg.total = 0 then
            r_status := 'rejected'; r_code := 'registration_not_found'; r_message := 'Esa persona no está inscrita en el evento';
          elsif reg.manual = 0 and reg.online = 0 then
            r_status := 'rejected'; r_code := 'refunded'; r_message := 'La inscripción está reembolsada: no se cambia desde la app';
          elsif reg.manual = 0 then
            -- El pago en línea manda. Si la app también dice "pagado" no hay nada que cambiar; si dice otra cosa, es un conflicto.
            if v_status = 'pagado' then r_status := 'unchanged'; r_revision := reg.revision;
            else r_status := 'rejected'; r_code := 'paid_online'; r_message := 'Pagó en línea: no se puede deshacer desde la app';
            end if;
          else
            -- Lo que le toca a cada inscripción manual: lo pagado (menos lo cubierto en línea), en orden, hasta el costo de cada una.
            select jsonb_object_agg(x.id, case when x.is_last then greatest(x.rest - x.before_cents, 0)
                                               else least(greatest(x.rest - x.before_cents, 0), x.amount_cents) end)
              into v_parts
              from (
                select r.id, r.amount_cents,
                       greatest(v_paid - reg.online_cents, 0) as rest,
                       coalesce(sum(r.amount_cents) over (order by r.created_at, r.id rows between unbounded preceding and 1 preceding), 0) as before_cents,
                       row_number() over (order by r.created_at desc, r.id desc) = 1 as is_last
                  from public.registrations r
                 where r.event_id = v_event and r.roper_id = v_global
                   and r.payment_status <> 'reembolsado' and r.payment_method is distinct from 'stripe'
              ) x;
            select bool_and(r.payment_status = v_status and r.payment_method is not distinct from v_method
                            and coalesce(r.amount_paid_cents, 0) = (v_parts ->> r.id::text)::bigint
                            and r.payment_note is not distinct from v_note and r.paid_by_roper_id is not distinct from v_by)
              into v_same
              from public.registrations r
             where v_parts ? r.id::text;
            if v_same then
              r_status := 'unchanged'; r_revision := reg.manual_revision;
            elsif v_rev > reg.manual_revision then
              update public.registrations r
                 set payment_status = v_status, payment_method = v_method, amount_paid_cents = (v_parts ->> r.id::text)::integer,
                     payment_note = v_note, paid_by_roper_id = v_by, payment_revision = v_rev, marked_by = p_organizer,
                     paid_at = case when v_status = 'pagado' then coalesce(v_paid_at, r.paid_at, now()) else null end
               where v_parts ? r.id::text;
              r_status := case when reg.manual_revision = 0 then 'accepted' else 'updated' end; r_revision := v_rev;
            else
              r_status := 'rejected'; r_code := 'stale_revision'; r_message := 'Llegó una revisión menor o igual con datos distintos';
              r_revision := reg.manual_revision;
            end if;
          end if;
        end if;
      end if;
    exception
      when sqlstate '22P02' or sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22023' or sqlstate '23514' then
        r_status := 'rejected'; r_code := 'invalid_field'; r_message := 'Un campo no cumple las reglas del contrato'; r_revision := null;
      when others then
        r_status := 'rejected'; r_code := 'temporary_error'; r_message := 'Falla interna al guardar este pago'; r_revision := null; r_retry := true;
    end;
    if r_status = 'accepted' then n_acc := n_acc + 1;
    elsif r_status = 'unchanged' then n_unc := n_unc + 1;
    elsif r_status = 'updated' then n_upd := n_upd + 1;
    else n_rej := n_rej + 1;
    end if;
    return next;
  end loop;
  insert into public.payment_uploads (organizer_id, client_batch_id, received, accepted, unchanged, updated, rejected)
  values (p_organizer, p_client_batch, n_total, n_acc, n_unc, n_upd, n_rej);
end $$;

revoke all on function public.app_upload_payments(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.app_upload_payments(uuid, jsonb, uuid) to service_role;
