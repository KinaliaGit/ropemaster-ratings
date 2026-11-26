# Ciclo de vida de los avisos (KIN-772)

Los avisos de la web (`notifications`: te sacaron de un evento, borraron un evento, te pasaron de la lista de espera a inscrito) ya no se acumulan sin límite.
Política decidida con Edgar el 2026-11-26. Migración `0056_ciclo_de_vida_de_los_avisos.sql`.

## Política

| Aviso | Cuándo expira |
|---|---|
| **Visto** (`read_at` con fecha) | A los **90 días** de haberse marcado como leído |
| **No visto** (`read_at` vacío) | Al **año** de creado (cuentas abandonadas). Mientras la persona no lo vea, sigue contando en la campana |
| **Con reembolso pendiente** (`refund_pending = true`) | **Nunca**, visto o no. Tiene valor financiero y no se elimina sin autorización |

- Lo vencido se **elimina** (no se archiva): lo que importa de verdad ya vive en `registration_removals` y `deleted_events`, que la limpieza no toca.
- Un aviso **nuevo** (visto hoy o creado hoy) nunca ha expirado; el plazo se cuenta desde que se marcó como leído, no desde que llegó.

## Cómo funciona (dos pasos independientes)

1. **Esconder al leer.** La regla de lectura de `notifications` ya no devuelve los avisos vencidos: la campana, el contador de no vistos y la página de avisos
   dejan de mostrarlos al instante, aunque la limpieza todavía no haya corrido. Cada persona sigue viendo **solo** los suyos (RLS intacto). Un aviso vencido
   tampoco se puede marcar como leído.
2. **Limpiar.** `private.purge_expired_notifications()` borra los vencidos y devuelve cuántos. Es **idempotente**: correrla dos veces seguidas no hace nada la
   segunda. No la puede llamar nadie desde la web ni desde la API (solo el administrador de la base).

La regla de qué es "vencido" está en **un solo lugar**, `private.notification_expired(read_at, created_at, refund_pending)`, y la usan la lectura y la limpieza,
así que nunca se contradicen. Para cambiar un plazo hay que cambiar esa función en una migración nueva.

## Programación

La migración programa la limpieza **todos los días a las 03:17 UTC** con `pg_cron` (trabajo `limpiar-avisos`), **si la extensión está disponible**. Es de mejor
esfuerzo: si no hay `pg_cron` o no hay permiso, la migración termina sin error y avisa con un `notice`; lo vencido igual se esconde al leer.

- Para activarla después: Supabase → **Database → Extensions** → `pg_cron`, y volver a ejecutar la migración (se puede ejecutar más de una vez).
- Para correrla a mano (SQL Editor): `select private.purge_expired_notifications();`
- Para ver el trabajo programado: `select jobname, schedule, active from cron.job where jobname = 'limpiar-avisos';`
- Para ver las últimas corridas: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`

## Pruebas

`npm run test:db`, bloque «Ciclo de vida de los avisos»: límites de los 90 días y del año (89 contra 91 días, 364 contra 366), la excepción del reembolso,
que solo se vea lo vigente y lo propio, que el contador de no vistos no cuente lo vencido, que la limpieza solo la pueda correr el administrador, que borre
exactamente lo vencido, que sea idempotente y que lo financiero no se toque.
