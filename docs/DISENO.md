# Diseño: registro global de lazadores

- La app (Ropemaster) es offline-first. Cada lazador local tiene `local_id` (UUID) y un
  `global_id` nullable que asigna este servidor al sincronizar. El ID de crossplay es un alias.
- El teléfono (E.164) es obligatorio al crear un lazador y es la llave de coincidencia.
  Nunca se fusiona automáticamente: el sistema sugiere y el organizador confirma.
- Verificación por SMS/WhatsApp solo cuando el lazador reclama su cuenta en la web.
- Subida: cola outbox en la app con UUID por registro (idempotente).
- Bajada: la app busca e importa lazadores (nombre, rating, historial) y los guarda en caché.
- El rating va de 1 a 10 (un decimal) y se calcula en el servidor. El teléfono nunca es público: vive en la tabla privada `roper_contacts` (migración 0009), que solo leen su dueño y los organizadores verificados.
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
- Fotos (Supabase Storage, buckets públicos): `avatars/<roper_id>/<marca de tiempo>.jpg` y `event-photos/<event_id>/<uuid>.jpg`.
  La web reduce en el navegador (perfil 256 px cuadrada; evento lado largo 1600 px; JPEG, lo que quita el EXIF), el servidor
  vuelve a comprobar el tipo REAL por sus bytes (`src/lib/image-validate.ts`, con pruebas en `tests/`) y sube con la sesión de
  la persona, así que las políticas de Storage (migraciones 0009 y 0011) deciden quién escribe dónde. Reemplazar o borrar elimina
  el archivo anterior. Límite de 5 MB para el archivo original; los buckets aceptan hasta 300 KB (avatares) y 2 MB (eventos), solo
  JPG/PNG/WebP. **Pendiente de endurecer:** Storage solo revisa el tipo *declarado* y no cuenta archivos, así que un organizador
  con sesión que llame a Storage directo puede guardar bytes arbitrarios (hasta 2 MB por archivo) en la carpeta de sus eventos.
  No es ejecutable (se sirve como image/*), pero conviene subir con la llave de servicio y quitar las políticas de escritura
  directa cuando esa llave esté en el entorno.
- Organizadores verificados: cualquiera puede crear una cuenta de organizador, pero solo los que un administrador marca como
  `profiles.organizer_verified = true` ven celulares y registran participantes (evita que alguien se registre solo para llevarse
  el directorio). Pendiente decidir el criterio: aprobación manual o licencia vigente de Rope Master.
- Base de datos: las columnas sensibles de `ropers` (como `user_id`) están ocultas por privilegios de columna, así que las consultas
  deben pedir las columnas por nombre (`select=id,full_name`), nunca `select=*`.

## Cuentas de organizador sin contraseña

Crear cuenta y entrar usan solo el correo: se envía un código de 6 dígitos (`signInWithOtp`) y se teclea en la web (`verifyOtp`).
Al crear, el nombre y la versión de términos aceptados viajan en `user_metadata`; al verificar el código se crean el perfil y la
constancia de aceptación. Al entrar no se revela si un correo existe. Requisitos en Supabase (Auth): la plantilla de "Magic Link"
y la de "Confirm signup" deben incluir `{{ .Token }}`, la longitud del código en 6 y un SMTP propio (el de Supabase es muy limitado).
