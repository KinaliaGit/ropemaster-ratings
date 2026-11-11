-- Los resultados solo se leen si el evento es visible para quien los pide (KIN-614). Solo cambia una política de lectura.
--
-- La política de la 0001 ("resultados son públicos", `using (true)`) dejaba leer CUALQUIER resultado directo desde la API de Supabase con
-- la llave anónima, incluso el de un evento en borrador. La web no lo exponía porque pide los resultados unidos a `events`, pero la tabla
-- quedaba abierta a quien la consultara sin pasar por la web, y un evento publicado puede volver a borrador.
--
-- Ahora un resultado es visible si y solo si lo es su evento. La subconsulta corre con los permisos de quien pregunta, así que le aplica la
-- política de `events` (0009): eventos publicados o finalizados para cualquiera, y además todos los propios para su organizador (también en
-- borrador). Si esa política cambia algún día, los resultados la siguen sin tocar esta.
--
-- No afecta al servidor (service_role y las funciones `security definer` de la app saltan las políticas) ni a las funciones de lectura de la
-- web (public_roper_results y public_roper_summary, que ya unían con `events`).

drop policy if exists "resultados son públicos" on public.event_results;
create policy "resultados de eventos visibles" on public.event_results for select
  using (exists (select 1 from public.events e where e.id = event_results.event_id));
