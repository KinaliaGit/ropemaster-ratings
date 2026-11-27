-- La visibilidad se elige al publicar un evento nuevo (KIN-769). Solo agrega un permiso de columna; no toca tablas, datos, funciones ni políticas.
--  * Un organizador activo ya puede crear su evento con `visibility = 'privado'` (el formulario de crear evento lo pregunta al darle a «Publicar»). Sigue valiendo
--    la regla de siempre para crear eventos: solo a su nombre y solo con licencia vigente o aprobación.
--  * SOLO al crear: no se agrega permiso de UPDATE, así que la visibilidad NO se puede cambiar después desde la web. Cambiarla en un evento ya publicado, con
--    gente inscrita, necesita su propia decisión y su confirmación (queda para después, junto con las invitaciones de KIN-753).
--  * Los valores válidos los sigue imponiendo el check de la 0057 ('publico' o 'privado'); cualquier otro se rechaza.
-- Se puede ejecutar más de una vez sin efecto extra.

grant insert (visibility) on public.events to authenticated;
