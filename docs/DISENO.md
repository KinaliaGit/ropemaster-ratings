# Diseño: registro global de lazadores

- La app (Ropemaster) es offline-first. Cada lazador local tiene `local_id` (UUID) y un
  `global_id` nullable que asigna este servidor al sincronizar. El ID de crossplay es un alias.
- El teléfono (E.164) es obligatorio al crear un lazador y es la llave de coincidencia.
  Nunca se fusiona automáticamente: el sistema sugiere y el organizador confirma.
- Verificación por SMS/WhatsApp solo cuando el lazador reclama su cuenta en la web.
- Subida: cola outbox en la app con UUID por registro (idempotente).
- Bajada: la app busca e importa lazadores (nombre, rating, historial) y los guarda en caché.
- El rating va de 1 a 10 (un decimal) y se calcula en el servidor. El teléfono nunca es público (ver vista `public_ropers`).
- Modalidades: cada participante tiene un rating por modalidad (`lazo`, `barriles`, …). Hoy solo Lazo está activo en la web
  (`src/lib/disciplines.ts`); activar otra es cambiar un flag.
- Idiomas: toda la web existe en español e inglés (`/es`, `/en`). Los textos viven en `src/dictionaries/{es,en}.ts`
  y TypeScript exige que ambos tengan las mismas claves. El contenido que escriben los organizadores (nombres, descripciones)
  no se traduce.
- Legal: al crear cuenta se exige aceptar Términos y Aviso de Privacidad (casilla obligatoria, validada también en el
  servidor) y se guarda qué versión aceptó cada persona (`src/lib/legal.ts`, migración 0008). Los textos están en
  `src/legal/{es,en}.ts`. Son un BORRADOR: falta confirmar el domicilio del responsable y que un abogado los revise
  (al aprobarlos, poner `draft: false` en `src/lib/legal.ts`). Punto a revisar: los organizadores pueden registrar a
  personas con su celular sin que ellas hayan aceptado nada todavía.
- Foto de perfil: el participante la sube desde Mi cuenta; se recorta cuadrada a 256 px en el navegador y el servidor
  valida el tipo real por sus bytes. Es pública (perfil, ranking, inscritos). Migración 0007 (Storage).
