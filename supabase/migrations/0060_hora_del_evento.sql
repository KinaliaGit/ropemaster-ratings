-- Hora del evento (KIN-778). Solo cambios aditivos: una columna nueva, opcional.
--  * `events.event_date` sigue siendo solo la fecha. La hora va aparte en `events.event_time` (hora local del evento, sin zona horaria), opcional: un evento sin hora
--    sigue funcionando igual y los que ya existían quedan en `null`.
--  * No se usa para decidir nada (inscripciones, finalización): es un dato para mostrar en listados, detalle y póster, y viaja a la app como `event_time` ("HH:MM").
--  * La zona horaria del evento (`events.timezone`, 0039) no cambia: sigue siendo un dato interno con el que se calcula el cierre de inscripciones. Ya no se pide en el formulario.
-- La lectura pública ya cubre la columna nueva (select a nivel de tabla, 0009); escribirla es solo del organizador dueño, como el resto de sus datos (grants por columna).
-- Se puede ejecutar más de una vez sin efecto extra.

alter table public.events add column if not exists event_time time without time zone;
grant insert (event_time) on public.events to authenticated;
grant update (event_time) on public.events to authenticated;
