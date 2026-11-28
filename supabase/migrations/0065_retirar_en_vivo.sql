-- Retirar la foto en vivo de un evento (KIN-787). Cambio aditivo: una función nueva; no toca tablas ni funciones existentes.
--
-- QUÉ ES: el organizador puede apagar «En vivo web» en la app. Al apagarlo la app pide retirar la última foto para que la página pública deje de
-- mostrar una ronda congelada y la ficha del evento deje de ofrecer «Ver resultados en vivo».
-- QUIÉN EJECUTA: solo el servidor (service_role) por `POST /api/app/eventos/<id>/en-vivo/retirar`, con la sesión de la app y permiso `results:write`.
-- Idempotente: retirar un evento sin foto no falla. Un evento de otro organizador o inexistente contesta 'not_found' (no se distingue).
create or replace function public.app_delete_live_snapshot(p_organizer uuid, p_event uuid)
returns table (outcome text)
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; gone int;
begin
  select e.organizer_id into owner_id from public.events e where e.id = p_event;
  if not found or owner_id is distinct from p_organizer then
    outcome := 'not_found'; return next; return;
  end if;
  delete from public.event_live_snapshots s where s.event_id = p_event;
  get diagnostics gone = row_count;
  outcome := case when gone > 0 then 'removed' else 'none' end; return next;
end $$;

revoke all on function public.app_delete_live_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_delete_live_snapshot(uuid, uuid) to service_role;
