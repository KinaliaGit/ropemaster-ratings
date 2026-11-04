-- Constancia de aceptación de términos para el registro real: cada persona registra la suya.
-- (La limpieza de avisos de rendimiento y los índices quedan en supabase/pendientes/ para cuando haya datos.)

revoke all on consents from anon, authenticated;
grant select on consents to authenticated;
grant insert (user_id, document, version) on consents to authenticated;
create policy "registra su propia aceptación" on consents for insert to authenticated
  with check (user_id = (select auth.uid()));
