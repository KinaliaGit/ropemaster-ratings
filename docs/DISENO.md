# Diseño: registro global de lazadores

- La app (Roadmaster) es offline-first. Cada lazador local tiene `local_id` (UUID) y un
  `global_id` nullable que asigna este servidor al sincronizar. El ID de crossplay es un alias.
- El teléfono (E.164) es obligatorio al crear un lazador y es la llave de coincidencia.
  Nunca se fusiona automáticamente: el sistema sugiere y el organizador confirma.
- Verificación por SMS/WhatsApp solo cuando el lazador reclama su cuenta en la web.
- Subida: cola outbox en la app con UUID por registro (idempotente).
- Bajada: la app busca e importa lazadores (nombre, rating, historial) y los guarda en caché.
- El rating se calcula en el servidor. El teléfono nunca es público (ver vista `public_ropers`).
