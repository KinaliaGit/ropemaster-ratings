# Checklist de lanzamiento (KIN-600)

Estado al 2026-11-05, rama `feat/organizadores-reales` (PR #1). ✅ hecho y probado · 🟡 hecho en código, falta probar o configurar · ⬜ pendiente · ⛔ bloqueado por una decisión o acceso.

## Cuentas y datos
- ✅ Organizadores y participantes reales (correo y contraseña, selector de rol; un organizador también puede ser lazador).
- ✅ Participante de demostración y `src/lib/mock.ts` eliminados de esta rama.
- ✅ **Códigos de conexión de la app** en la base (KIN-584): migración `0011_codigos_de_conexion` aplicada en `rope-master-ratings` y unida a esta rama. Sin la service role key usan memoria solo en desarrollo y se niegan a funcionar en producción: **hace falta `SUPABASE_SERVICE_ROLE_KEY` en Vercel (Production)** para que la pestaña «App local» funcione.
- ✅ Datos de prueba borrados: evento «E1 Prueba», inscripciones, cuentas de prueba y las cuentas vacías de Edgar y Neaves (deben registrarse de nuevo). En la base solo queda la cuenta de Ana.
- ⬜ Dar de alta a los primeros organizadores reales (licencia vigente o aprobación de un admin).

## Acceso y licencia de organizadores
- ✅ Candado por licencia en la base (0015): sin licencia vigente ni aprobación manual no operan; vencida = no crea ni edita.
- 🟡 **Enlace automático con la base de licencias** (KIN-572): el código está hecho y probado en sus partes (`src/lib/licencias*.ts`, `license-link.ts`); falta **ejecutar a mano** `docs/licencias/licencia_vigente_web.sql` en el SQL Editor de `rope-master-licencias` y poner `LICENCIAS_URL`, `LICENCIAS_ANON_KEY` y `LICENCIAS_CHECK_SECRET` (sensible) en Vercel. Sin eso, todo sigue como hoy: aprobación manual. Pendiente de decidir: si un plan `event_pass` también habilita al organizador (hoy sí).
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
- ✅ **Confirmación de correo ACTIVADA y probada en el dominio real** (2026-11-05): registro → correo de «Rope Master Verificacion» (`servicios@kinalia.com.mx`) → enlace → perfil de lazador y constancia de términos creados. El enlace vale 1 hora (decisión de Ana: se deja así; se reenvía desde el registro).
- ⬜ Encender «protección contra contraseñas filtradas» (aviso `auth_leaked_password_protection`), CAPTCHA y límites de Auth.
- ⬜ Dominio y SSL; respaldos (Supabase Pro) y plan de rollback.
- ✅ Archivo huérfano del flyer de «E1 Prueba» borrado de `event-photos` (con `supabase storage rm --remote --experimental`, sin necesitar la service role en la máquina). Los buckets `event-photos` y `avatars` quedaron vacíos.
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

## Seguridad (revisión del 2026-11-05)
**Verificado:**
- ✅ Inyección SQL: la web no arma SQL ni filtros con texto del usuario (solo la API de Supabase con parámetros); las funciones de la base reciben parámetros y fijan `search_path`.
- ✅ Permisos de la base: RLS en todas las tablas y 200+ comprobaciones automáticas en CI (`npm run test:db`). Las únicas funciones con permisos elevados que un visitante puede llamar son 2, públicas a propósito (conteos de eventos publicados).
- ✅ Secretos: ninguno en el código ni en el historial de git; `.env.local` no se versiona; las `NEXT_PUBLIC_*` solo llevan datos públicos; la llave de servicio solo se usa en servidor.
- ✅ Dependencias: `npm audit` sin vulnerabilidades; Dependabot activo.
- ✅ Cabeceras de seguridad (clickjacking, nosniff, referrer, permisos, HSTS, `form-action`/`base-uri`/`object-src`).
- ✅ Fotos validadas por sus bytes reales, con tope de tamaño; redirecciones solo a rutas internas; webhook de Stripe con firma.
**Pendiente / recomendado antes de lanzar:**
- ⬜ CSP completa para scripts (hace falta un *nonce* por petición con Next; hoy solo hay el subconjunto seguro).
- ⬜ CAPTCHA y límites en Supabase Auth (*Attack Protection*) contra fuerza bruta y registros masivos; protección contra contraseñas filtradas (plan Pro).
- ⬜ 2FA en las cuentas con acceso a Supabase, Vercel y GitHub (quien tiene la llave de servicio puede leer todo).
- ⬜ `main` publica directo a producción y no tiene protección de rama (en GitHub gratis con repo privado no está disponible): acordar que todo pase por PR con CI en verde.
- ⬜ Respaldos (Supabase Pro), plan de rollback y rotación de llaves si alguna se comparte por error.
- ⬜ Revisión externa / prueba de penetración antes de abrir al público.
