-- Soporte para el registro real de organizadores y limpieza de los 2 avisos del revisor de Supabase.

-- 1) Cada persona registra su propia aceptación de términos (solo para sí misma y solo estas columnas).
revoke all on consents from anon, authenticated;
grant select on consents to authenticated;
grant insert (user_id, document, version) on consents to authenticated;
create policy "registra su propia aceptación" on consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 2) Una sola política de lectura por tabla (evita evaluar dos reglas por consulta).
drop policy if exists "celular visible a organizadores verificados" on roper_contacts;
drop policy if exists "celular visible a su dueño" on roper_contacts;
create policy "celular visible a su dueño u organizadores verificados" on roper_contacts for select to authenticated
  using (
    roper_id = (select private.current_roper_id())
    or exists (select 1 from profiles p where p.user_id = (select auth.uid()) and p.role = 'organizador' and p.organizer_verified)
  );

drop policy if exists "dueño gestiona categorías" on event_categories;
create policy "dueño agrega categorías" on event_categories for insert to authenticated
  with check (exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));
create policy "dueño edita categorías" on event_categories for update to authenticated
  using (exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())))
  with check (exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));
create policy "dueño borra categorías" on event_categories for delete to authenticated
  using (exists (select 1 from events e where e.id = event_id and e.organizer_id = (select auth.uid())));

-- 3) Índices para las consultas de la web (eventos públicos por fecha y eventos de cada organizador).
create index if not exists events_status_date_idx on events (status, event_date);
create index if not exists events_organizer_idx on events (organizer_id);
create index if not exists event_categories_event_idx on event_categories (event_id);
