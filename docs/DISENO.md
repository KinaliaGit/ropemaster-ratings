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
  la persona, así que las políticas de Storage (migraciones 0009 y 0017) deciden quién escribe dónde. Reemplazar o borrar elimina
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

## Correo y contraseña para todos; sin celular (migración 0013)

Organizadores y participantes crean cuenta y entran con **correo y contraseña** (se elige el rol en "Entrar" y en "Crear cuenta").
Ya no se pide el celular: el contacto de un participante es su **correo** (`roper_contacts.email`, único, en minúsculas; `phone_e164` queda opcional).
Un organizador verificado da de alta a un participante con nombre y correo (`create_participant`). Cuando esa persona crea su cuenta con el
mismo correo, `claim_my_roper` (se llama al registrarse y al entrar) enlaza la cuenta con ese perfil y conserva su historial; si no existía, crea uno.

**Pendiente antes del lanzamiento (KIN-600):** el reclamo exige correo CONFIRMADO. Con "Confirm email" apagado en Auth (como en desarrollo)
cualquiera podría reclamar el perfil de otra persona con solo escribir su correo: hay que encenderlo y tener SMTP real (Brevo).
Los textos legales ya hablan de correo en lugar de celular; conviene que los revise quien los redactó.

## Inscripciones (migración 0014, KIN-581)

`registrations` no se escribe desde la API: solo `register_for_event` y `cancel_registration` (SECURITY DEFINER, esquema `private`).
`register_for_event` bloquea la fila del evento (`FOR UPDATE`), valida (evento publicado, categoría del evento, sin repetir) y cuenta antes de
insertar: dos personas no toman el último lugar a la vez. El precio sale de la categoría. El cupo cuenta inscripciones (dos categorías = dos lugares).
Hasta que exista el pago (Stripe) la inscripción queda `pendiente` y ocupa lugar; se puede cancelar mientras no esté pagada.
Conteo y lista pública: `event_registration_counts()` / `event_registrants(evento)` (solo eventos publicados, sin pagos).
Si un evento se pasa a borrador, las inscripciones se conservan (el participante las sigue viendo; el público ya no).

## Licencia de organizadores (migración 0015, KIN-572)

Un organizador **opera** (crea y edita eventos, categorías y fotos, ve el directorio, registra participantes) solo si está **activo**:
`private.organizer_active()` = licencia vigente (`profiles.license_valid_until > now()`, `infinity` = sin vencimiento) **o** aprobado a mano por un admin (`organizer_verified`).
- Licencia vigente: activo automático, hasta que venza (la base compara con `now()`, no hace falta ningún proceso).
- Sin licencia: queda **en revisión manual**; hasta que un admin lo apruebe no puede hacer nada (solo ve su cuenta y sus datos).
- Licencia vencida (y sin aprobación manual): ya no crea ni edita nada; sigue viendo sus propios eventos.
Las columnas `license_*` NO son editables desde la API: las escribe solo el servidor con la service role tras comprobar la licencia.

**Pendiente (bloquea la vinculación automática):** la comprobación contra la base de licencias (proyecto `rope-master-licencias`, con compradores reales)
y la `SUPABASE_SERVICE_ROLE_KEY` de ratings en `.env.local`. Regla acordada: el correo de la licencia debe coincidir con el de la cuenta; un folio (`order_id`) solo
se vincula a una cuenta (índice único). Mientras tanto la vía manual (admin) funciona.

## Organizador que también es lazador (migración 0016)

Una persona = una cuenta (el correo es único). La cuenta tiene dos "espacios": **organizador** (`profiles.role = 'organizador'`, con licencia o aprobación)
y **lazador** (su fila en `ropers`, enlazada por `user_id`). Cualquier cuenta puede crear su perfil de lazador con el botón de "Mi cuenta"
(`claim_my_roper`: reclama el que otro organizador haya registrado con su correo, si no, crea uno) y con él puede inscribirse a eventos.
La licencia vencida solo afecta el lado de organizador: el perfil de lazador, su historial y sus inscripciones siguen igual.
"Entrar como" elige el espacio al que se llega; una cuenta de participante no tiene espacio de organizador (pendiente: solicitarlo, pasando por licencia o aprobación).

## Renumeración de 0011 → 0017

`main` ya trae `0011_codigos_de_conexion.sql` (KIN-584), así que nuestra `0011_fotos_storage.sql` pasó a **`0017_fotos_storage.sql`** (contenido idempotente y con el estado final de las políticas, ver su encabezado).
En la base real el historial (`supabase_migrations.schema_migrations`) se cambió de `0011` a `0017` para que no se vuelva a ejecutar.
Al unir las ramas, `0011_codigos_de_conexion` queda por detrás de la última migración aplicada: se aplica con `npx supabase db push --remote --include-all`.
