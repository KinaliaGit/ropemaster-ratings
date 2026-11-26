-- Ciclo de vida de los avisos (KIN-772). Solo agrega dos funciones y reemplaza la regla de LECTURA de `notifications`; no toca la tabla, los datos ni quién
-- puede escribir. Política (decidida con Edgar; ver docs/NOTIFICACIONES.md):
--  * Un aviso VISTO expira a los 90 días de haberse marcado como leído. Un aviso NO visto expira al año de creado (cuentas abandonadas).
--  * Un aviso con `refund_pending` NUNCA expira ni se limpia (tiene valor financiero; lo que importa de verdad vive en `registration_removals` y
--    `deleted_events`, que esta migración no toca).
--  * Lo vencido se ELIMINA (no se archiva): el registro de lo importante ya está en las tablas de arriba.
--  * Expirar y limpiar son dos pasos independientes: la regla de lectura esconde lo vencido al instante (la campana, el contador y la página de avisos ya
--    no lo ven aunque la limpieza no haya corrido) y la limpieza lo borra de verdad, una vez al día.
-- La limpieza es idempotente: correrla dos veces seguidas no hace nada la segunda. Se puede ejecutar esta migración más de una vez sin efecto extra.

-- ¿Venció este aviso? Un solo lugar para la regla: la usan la lectura y la limpieza, así que nunca se contradicen.
create or replace function private.notification_expired(p_read_at timestamptz, p_created_at timestamptz, p_refund_pending boolean) returns boolean
  language sql stable set search_path = ''
  as $$
    select not coalesce(p_refund_pending, false)
       and (   (p_read_at is not null and p_read_at < now() - interval '90 days')
            or (p_read_at is null and p_created_at < now() - interval '1 year'))
  $$;
revoke all on function private.notification_expired(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function private.notification_expired(timestamptz, timestamptz, boolean) to authenticated;

-- Lectura: cada persona sigue viendo SOLO sus avisos (igual que antes) y ya no ve los vencidos.
drop policy if exists "avisos propios (leer)" on public.notifications;
create policy "avisos propios (leer)" on public.notifications for select to authenticated using (
  user_id = (select auth.uid()) and not (select private.notification_expired(read_at, created_at, refund_pending))
);

-- Limpieza: borra los avisos vencidos y devuelve cuántos. No la puede llamar nadie desde la web (ni anónimos ni personas con sesión ni la API): solo el
-- administrador de la base, es decir el programador de abajo o quien la corra a mano desde el SQL Editor.
create or replace function private.purge_expired_notifications() returns integer
  language plpgsql security definer set search_path = ''
  as $$
declare gone integer;
begin
  with deleted as (
    delete from public.notifications n where private.notification_expired(n.read_at, n.created_at, n.refund_pending) returning 1
  ) select count(*) into gone from deleted;
  return gone;
end $$;
revoke all on function private.purge_expired_notifications() from public, anon, authenticated;

-- Programación diaria (03:17 UTC) con pg_cron, SI la extensión está disponible. Es de mejor esfuerzo: si no existe o no hay permiso, la migración
-- sigue sin error (lo vencido igual se esconde al leer) y la limpieza se puede correr a mano: `select private.purge_expired_notifications();`.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('limpiar-avisos', '17 3 * * *', 'select private.purge_expired_notifications()');
  else
    raise notice 'pg_cron no está disponible: la limpieza de avisos no quedó programada (corre private.purge_expired_notifications() a mano o activa la extensión en Database > Extensions y vuelve a ejecutar esta migración).';
  end if;
exception when others then
  raise notice 'No se pudo programar la limpieza de avisos (%): corre private.purge_expired_notifications() a mano o activa pg_cron y vuelve a ejecutar esta migración.', sqlerrm;
end
$cron$;
