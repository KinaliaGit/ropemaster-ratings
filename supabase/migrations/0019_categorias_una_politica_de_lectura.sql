-- Aviso de rendimiento de `supabase db advisors` (multiple_permissive_policies en event_categories).
-- "dueño gestiona categorías" era FOR ALL y por eso también leía: para el mismo rol había DOS políticas de lectura que se evaluaban en cada consulta.
-- La lectura ya la cubre "categorías de eventos visibles" (eventos públicos o propios), así que se separa la escritura en tres políticas sin lectura.
-- No cambia quién puede qué: solo el dueño ACTIVO (licencia o aprobación) agrega, edita o borra categorías de SUS eventos.

drop policy if exists "dueño gestiona categorías" on event_categories;

create policy "dueño agrega categorías" on event_categories for insert to authenticated
  with check ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));
create policy "dueño edita categorías" on event_categories for update to authenticated
  using ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())))
  with check ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));
create policy "dueño borra categorías" on event_categories for delete to authenticated
  using ((select private.organizer_active()) and exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));
