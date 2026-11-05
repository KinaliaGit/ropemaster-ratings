# Checklist de lanzamiento (KIN-600)

Estado al 2026-11-05, rama `feat/organizadores-reales` (PR #1). ✅ hecho y probado · 🟡 hecho en código, falta probar o configurar · ⬜ pendiente · ⛔ bloqueado por una decisión o acceso.

## Cuentas y datos
- ✅ Organizadores y participantes reales (correo y contraseña, selector de rol; un organizador también puede ser lazador).
- ✅ Participante de demostración y `src/lib/mock.ts` eliminados de esta rama.
- 🟡 **Códigos de conexión de la app:** en esta rama siguen en memoria (`src/lib/sync-tokens.ts`) y existe el atajo `APP_SYNC_TOKEN`. La versión en la base (KIN-584, migración `0011_codigos_de_conexion`) está en `main`: al unir las ramas se quita el atajo y se aplica con `npx supabase db push --remote --include-all`.
- ⬜ Borrar de producción los datos de prueba que queden (hoy: el evento «E1 Prueba» y la cuenta vacía de `emilianoneaves@gmail.com`, sin perfil).
- ⬜ Dar de alta a los primeros organizadores reales (licencia vigente o aprobación de un admin).

## Acceso y licencia de organizadores
- ✅ Candado por licencia en la base (0015): sin licencia vigente ni aprobación manual no operan; vencida = no crea ni edita.
- ⛔ **Enlace automático con la base de licencias** (`rope-master-licencias`, compradores reales): falta el repo/acceso, el permiso explícito para crear una función de solo lectura allí y `SUPABASE_SERVICE_ROLE_KEY` de ratings. Regla acordada: el correo de la licencia debe coincidir con el de la cuenta y un folio se vincula a una sola cuenta. Mientras tanto: aprobación manual desde Administración.
- ⬜ Quién aprueba organizadores sin licencia y con qué criterio.

## Dinero
- ✅ Efectivo y transferencia: el organizador marca «pagado»; instrucciones de pago visibles solo para inscritos (0018).
- 🟡 Pago en línea con Stripe: código y webhook listos pero **sin probar contra Stripe real** y apagados sin llaves.
- ⬜ Stripe en producción con llaves nuevas (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), cuenta conectada por organizador guardada en la base (hoy `STRIPE_TEST_CONNECTED_ACCOUNT`), comisión y reembolsos decididos, y un cobro real de punta a punta (issues de Neaves).

## Inscripciones
- ✅ Cupo seguro probado con inscripciones simultáneas contra la base real; conteos y listas reales; cancelar mientras esté pendiente.

## Sincronización con la app (Edgar)
- ⬜ Evento de ensayo completo: web → app → resultados sin internet → subida → rating.
- ⬜ Probado con una versión anterior de la app (la base local no va a cuarentena).
- ⬜ Los endpoints `/api/app/*` aún no mandan inscritos ni participantes reales.

## Rating
- ⛔ La fórmula del rating la define la FMR (KIN-571); el cálculo y la publicación (KIN-583) esperan eso.

## Plataforma y seguridad
- ⬜ **Confirmación de correo ACTIVADA** con SMTP real (Brevo): es obligatoria, porque el reclamo de perfiles por correo exige correo confirmado. Poner la URL de la web en las URLs permitidas de redirección de Auth y usar `{{ .ConfirmationURL }}`/`/auth/confirm` en la plantilla. El flujo ya está en el código (KIN-576) pero sin probar con correo real.
- ⬜ Encender «protección contra contraseñas filtradas» (aviso `auth_leaked_password_protection`), CAPTCHA y límites de Auth.
- ⬜ Dominio y SSL; respaldos (Supabase Pro) y plan de rollback.
- ⬜ Cerrar la escritura directa a Storage (hallazgo documentado en `docs/DISENO.md`) con la service role.
- ⬜ Aviso de rendimiento en `event_categories` (varias políticas permisivas de lectura).
- ⬜ CI en verde y protección de `main` (PR #2 de revisión automática).
- 🟡 Migraciones `0001`–`0018` aplicadas en `rope-master-ratings` (la `0011` de Edgar queda por aplicar al unir ramas).

## Legal
- ⬜ Términos y Aviso de Privacidad aprobados por el abogado; quitar la etiqueta «Borrador» (`DRAFT` en `src/lib/legal.ts`). Cambió el contenido: ya no se pide celular, se usa el correo.

## Operación
- ⬜ Quién atiende soporte y cómo se enteran de un pago o una sincronización fallida.
- ⬜ Texto de lanzamiento y enlace desde la página de Rope Master en kinalia.com.mx.

## Hecho cuando
Los tres (Ana, Edgar, Neaves) revisan esta lista y están de acuerdo en abrir.
