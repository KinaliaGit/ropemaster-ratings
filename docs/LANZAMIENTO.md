# Checklist de lanzamiento (KIN-600)

Estado al 2026-11-05, rama `feat/organizadores-reales` (PR #1). ✅ hecho y probado · 🟡 hecho en código, falta probar o configurar · ⬜ pendiente · ⛔ bloqueado por una decisión o acceso.

## Cuentas y datos
- ✅ Organizadores y participantes reales (correo y contraseña, selector de rol; un organizador también puede ser lazador).
- ✅ Participante de demostración y `src/lib/mock.ts` eliminados de esta rama.
- ✅ **Códigos de conexión de la app** en la base (KIN-584): migración `0011_codigos_de_conexion` aplicada en `rope-master-ratings` y unida a esta rama. Sin la service role key usan memoria solo en desarrollo y se niegan a funcionar en producción: **hace falta `SUPABASE_SERVICE_ROLE_KEY` en Vercel (Production)** para que la pestaña «App local» funcione.
- ✅ Evento de prueba «E1 Prueba» e inscripción borrados (la base quedó sin eventos). Queda la cuenta vacía de `emilianoneaves@gmail.com` (sin perfil).
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
- 🟡 `GET /api/app/eventos` ya manda inscritos con su pago (KIN-585, migración 0024) y `participantes` y `resultados` ya usan datos reales; falta probarlos con un evento de ensayo y la app (ver arriba).

## Rating
- ⛔ La fórmula del rating la define la FMR (KIN-571); el cálculo y la publicación (KIN-583) esperan eso.

## Plataforma y seguridad
- 🟡 **Confirmación de correo ACTIVADA** (ya está encendida y el SMTP de Brevo manda el correo desde `servicios@kinalia.com.mx`; falta probar el enlace de punta a punta en el dominio real, que hoy sirve la versión vieja hasta unir el PR #1). **ACTIVADA** con SMTP real (Brevo): es obligatoria, porque el reclamo de perfiles por correo exige correo confirmado. Poner la URL de la web en las URLs permitidas de redirección de Auth y usar `{{ .ConfirmationURL }}`/`/auth/confirm` en la plantilla. El flujo ya está en el código (KIN-576) pero sin probar con correo real.
- ⬜ Encender «protección contra contraseñas filtradas» (aviso `auth_leaked_password_protection`), CAPTCHA y límites de Auth.
- ⬜ Dominio y SSL; respaldos (Supabase Pro) y plan de rollback.
- ⬜ Borrar el archivo huérfano del flyer de «E1 Prueba» en el bucket `event-photos` (borrar un evento solo quita las filas; los archivos se quitan por la API con la service role).
- ⬜ Cerrar la escritura directa a Storage (hallazgo documentado en `docs/DISENO.md`) con la service role.
- ✅ Aviso de rendimiento en `event_categories` resuelto (migración 0019).
- 🟡 `db advisors` deja 5 avisos: 4 son **intencionales** (`event_registration_counts` y `event_registrants` son SECURITY DEFINER y públicas a propósito: solo devuelven números e ids de eventos publicados, sin pagos ni contactos) y 1 es la protección contra contraseñas filtradas (se enciende en el panel de Auth).
- ⬜ CI en verde y protección de `main` (PR #2 de revisión automática).
- ✅ Migraciones `0001`–`0019` aplicadas en `rope-master-ratings` (con la `0011` de Edgar).

## Legal
- ⬜ Términos y Aviso de Privacidad aprobados por el abogado; quitar la etiqueta «Borrador» (`DRAFT` en `src/lib/legal.ts`). Cambió el contenido: ya no se pide celular, se usa el correo.

## Operación
- ⬜ Quién atiende soporte y cómo se enteran de un pago o una sincronización fallida.
- ⬜ Texto de lanzamiento y enlace desde la página de Rope Master en kinalia.com.mx.

## Hecho cuando
Los tres (Ana, Edgar, Neaves) revisan esta lista y están de acuerdo en abrir.
