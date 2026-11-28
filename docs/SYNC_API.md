# API de sincronización con la app local

La app (Tauri) descarga eventos y participantes del organizador cuando hay internet y los guarda en su
SQLite local. Sin internet la app sigue funcionando con lo ya descargado.

Autenticación: `Authorization: Bearer <token>`. El token lo entrega `POST /api/app/login` (la app entra con el correo y la contraseña del organizador; ya no hay códigos que se copien y se peguen a mano, KIN-631). Se muestra una sola vez y la base (`api_tokens`) guarda solo su hash sha256. Un token revocado deja de funcionar al instante, y reiniciar el servidor no desconecta a la app. El panel (pestaña *App local*) lista los equipos conectados con cuándo se conectaron y cuándo se usaron por última vez, y permite revocar cada uno.

Cada equipo tiene su propio token (hasta 3 por organizador). **Todo token vence a los 30 días sin usarse**; cada uso exitoso reinicia el plazo, y sin internet no vence por reloj de la app: lo decide la web cuando la app vuelve a conectarse. Un token vencido responde `401` igual que uno revocado, y la app pide reconectar sin tocar sus datos locales.

- `401` (`code: "invalid_token"`): token inválido, revocado o vencido por 30 días sin uso (no reintentar; la app pide reconectar).
- `429` (`code: "rate_limited"`): demasiados intentos con un token inválido desde la misma IP (20 en 5 minutos). Trae `Retry-After`.
- `503` (`code: "service_unavailable"`): falla temporal al verificar el token. Sí reintentar.

Configuración del servidor: `SUPABASE_SERVICE_ROLE_KEY` (secreta, solo servidor) es obligatoria en producción; sin ella la API responde `503`. El valor fijo `APP_SYNC_TOKEN` solo funciona fuera de producción, para pruebas locales.

## `POST /api/app/login`
La app entra con el correo y la contraseña de la cuenta de organizador de la web (los mismos del sitio). La web comprueba la contraseña con
Supabase Auth, **no abre una sesión de navegador** y entrega un token propio para ese equipo. Ese token se usa como `Authorization: Bearer <token>`
en todos los demás endpoints. La app lo guarda en el llavero del sistema (nunca la contraseña) y sin internet sigue
funcionando con lo que ya tiene: el login solo se necesita para conectar y para reconectar.

Cuerpo (ver `sync-examples/login.request.json`): `contract_version`, `email`, `password` y `device_name` (opcional, hasta 60 caracteres; si falta queda "Equipo").
La contraseña se recorta y se corta a 100 caracteres, igual que en el formulario de la web. Respuesta 200: `sync-examples/login.response.json`.
**El token se muestra una sola vez**; en la base solo queda su hash. `idle_days` son los días sin uso tras los que vence.

| Estado | `code` | Cuándo | ¿La app reintenta? |
|---|---|---|---|
| `400` | `invalid_json`, `invalid_body`, `invalid_field` | Cuerpo mal formado | no, es un error de la app |
| `401` | `invalid_credentials` | Correo o contraseña incorrectos (mismo mensaje si el correo no existe) | no, pide corregir |
| `403` | `email_not_confirmed` | La contraseña es correcta pero falta confirmar el correo | no, pide confirmar |
| `403` | `organizer_not_active` | La cuenta no es de organizador activo (licencia vigente o aprobación de un administrador) | no |
| `409` | `device_limit` | Ya hay 3 equipos conectados. **No cierra ninguno**: el organizador revoca uno en *App local*, desde el menú de su cuenta | no, pide revocar uno |
| `413` | `payload_too_large` | Cuerpo de más de 4 KB | no |
| `426` | `version_unsupported` | La web ya no habla esa versión del contrato | no, pide actualizar |
| `429` | `rate_limited` | Demasiados intentos fallidos (20 por IP o 10 por correo en 5 minutos; solo cuentan los fallos). Trae `Retry-After` | sí, tras la espera |
| `503` | `service_unavailable` | Falla temporal de la web o de Supabase | sí |

## Enlace privado por evento: `POST /api/app/conexion` (KIN-783)
Convive con el login: con correo y contraseña la app ve **todo** el organizador; con un enlace privado ve y escribe en **un solo evento**, sin la
contraseña (por ejemplo, la persona que captura en la arena). Decisiones en KIN-782.

1. El organizador crea el enlace en el panel (*App local → Enlaces por evento*): elige el evento (solo `publicado` o `finalizado`), para quién es y los permisos.
   La web entrega una **invitación** (`rmi_…`) que se muestra una sola vez. Es de un solo uso y **vence a las 72 h**. En la base solo queda su hash.
2. La app (o el operador) la canjea sin `Authorization`: `POST /api/app/conexion` con `{ contract_version, invite, device_name? }`
   (ejemplos: `sync-examples/conexion.request.json` y `conexion.response.json`). Responde el **token del evento** (`rme_…`, también una sola vez), el evento,
   los `scopes` y `expires_at`. Con ese token se usa `Authorization: Bearer <token>` como siempre.
3. Permisos (`scopes`): `event:read` (siempre: ver el evento, sus inscritos y quién ya pagó), `results:write` (subir resultados, cerrar y reabrir)
   y `payments:write` (subir pagos, por ejemplo en efectivo). **Solo puede haber un enlace con `results:write` por evento** y hasta 5 enlaces activos por evento.
4. Vigencia: el token vence a los **30 días sin usarse** y, a más tardar, a los **7 días de la fecha del evento**. Cada uso reinicia el plazo de inactividad.
   El organizador lo revoca al instante desde su panel, o la app con `POST /api/app/logout` (revoca solo ese enlace). Si el evento deja de estar publicado, responde `404`.
5. Mientras haya un enlace con `results:write` activo y los resultados estén abiertos, la web **no deja borrar resultados** del evento (error `connected_event`
   en la base): ciérralos, o revoca el enlace de escritura. Hoy la web no tiene un botón para borrarlos; el candado cubre cualquier otro camino.

Qué responde cada endpoint con un token de evento:

| Endpoint | Con token de evento |
|---|---|
| `GET /api/app/eventos` | Solo ese evento (mismo formato, misma paginación y `since`). Requiere `event:read`. |
| `GET /api/app/participantes` | Solo si `event_id` es su evento; otro evento: `404 event_not_found`. |
| `POST /api/app/resultados` | Requiere `results:write`. Si **algún** resultado del lote es de otro evento (o no trae `event_id`) se rechaza todo el lote con `404 event_not_found`. |
| `POST /api/app/pagos` | Requiere `payments:write`; mismo criterio del lote. |
| `POST /api/app/eventos/<id>/cierre` y `/reabrir` | Requieren `results:write` y que `<id>` sea su evento. |
| `POST /api/app/eventos` (crear eventos y series), `POST /api/app/login` | Solo con correo y contraseña: `403 scope_denied`. |

Códigos nuevos: `403 scope_denied` (el token no tiene el permiso o la ruta no admite enlaces) y `404 event_not_found` (otro evento, uno inexistente o
uno que dejó de ser público: no se distinguen). Al canjear: `401 invalid_invite` cuando la invitación no existe, ya se usó, venció, se revocó o su evento ya no está publicado
(todos se ven igual y gastan el límite de intentos: 20 por IP en 5 minutos, `429 rate_limited` con `Retry-After`); además `400`, `413` (más de 4 KB) y `426` como en el login.
La respuesta 200 incluye `organizer` (id y nombre del dueño del evento).

## `POST /api/app/logout`
`Authorization: Bearer <token>`. Revoca **solo** el token con el que se llama (ese equipo, o ese enlace si es un token de evento). Siempre responde `200 { "ok": true, "revoked": <boolean> }`:
un token que ya estaba revocado, vencido o que no existe da `revoked: false`, así la app puede olvidar su token local sin distinguir. Sin internet la app
solo lo olvida; la web lo deja vencer a los 30 días sin uso o el organizador lo revoca en su panel. Sin encabezado `Authorization`: `401 invalid_token`.

## `GET /api/app/eventos?since=<ISO-8601>&cursor=<texto>`

Estado: implementada (KIN-585). Ejemplo completo y versionado: [`docs/sync-examples/eventos.response.json`](sync-examples/eventos.response.json); la web lo comprueba en sus pruebas y la app puede usarlo tal cual como dato de prueba.

Eventos del organizador del token con estado `publicado` o `finalizado` (los borradores nunca se envían), cada uno con sus categorías y sus
inscritos con el estado de pago. Un organizador nunca recibe eventos de otro.

- **Versión del contrato.** La respuesta trae `contract_version` (hoy `1`). La app puede declarar la que entiende con el encabezado opcional
  `X-Contract-Version: 1`; si no lo manda se asume la actual. Una versión que la web no habla es `426` con `code: "version_unsupported"` (la app deja de
  sincronizar y pide actualizar). Agregar campos opcionales NO sube la versión: quien lee ignora lo que no conoce.
- **Cada evento que cambió llega COMPLETO**, con la lista vigente de inscritos. La app reemplaza lo que tenía de las inscripciones de ese evento: así
  una cancelación se entiende sola (la inscripción ya no viene).
- **`since` (opcional, ISO-8601 con hora).** Devuelve solo los eventos que cambiaron desde esa fecha (inclusive). Cuenta como cambio del evento:
  editarlo, **inscribirse, pagar, cancelar** (también un reembolso), cambiar el costo o el nombre de una categoría y cambiar el nombre de un inscrito.
  Las inscripciones anteriores a la migración 0024 se marcaron como cambiadas **una sola vez** al aplicarla: un `since` anterior a esa fecha las recibe completas.
  Guarda el `generated_at` de la respuesta (la última página) para el siguiente `since`. Un evento que cambió justo en ese instante puede repetirse
  una vez: es seguro, la app lo reemplaza.
- **Paginación.** Hasta 50 eventos por página, en orden estable. Si `next_cursor` no es `null`, repite la misma petición con `?cursor=<next_cursor>` (y el
  mismo `since`). Todas las páginas de una descarga comparten el mismo `generated_at`. El cursor es opaco: no lo armes ni lo interpretes.
- Respuesta con `Cache-Control: no-store`.

```json
{ "contract_version": 1, "organizer": "<id del organizador>", "events": [{
  "id": "…", "slug": "rodeo-norte-2026", "name": "…", "date": "2026-12-06", "city": "…", "venue": "…", "status": "publicado",
  "disciplines": ["lazo"], "capacity": 100, "max_roper_rating": 6.5, "description": "…", "updated_at": "2026-11-05T18:30:00.000Z",
  "categories": [{ "id": "…", "name": "Libre", "fee_cents": 80000 }],
  "registrations": [{ "id": "…", "roper_global_id": "…", "name": "…", "category_id": "…", "category": "Libre",
                      "payment_status": "pagado", "amount_cents": 80000, "payment_method": "efectivo" }]
}], "next_cursor": null, "generated_at": "2026-11-06T09:00:00.000Z" }
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | Id del evento en la web (el mismo `event_id` que se usa al subir resultados). |
| `slug` | texto | Parte de la dirección pública del evento. |
| `date` | `AAAA-MM-DD` o `""` | Solo la fecha; la hora, si la hay, va aparte en `event_time`. |
| `event_time` | `HH:MM` o `null` | Hora local del evento (KIN-778), 24 h y **sin zona horaria**. `null` (o ausente en una web anterior) = el evento no tiene hora. La app la guarda como espejo de solo lectura y no la usa para decidir nada. La zona horaria del evento es un dato interno de la web y **no se manda**. |
| `status` | `publicado` \| `finalizado` | |
| `disciplines` | lista de ids de modalidad | `lazo`, `barriles` (ver *Modalidades*). |
| `capacity` | entero o `null` | Cupo **total** del evento (cuenta inscripciones; con el rol «los dos», cada lado ocupa un lugar). `null` = sin límite. |
| `capacity_headers` / `capacity_heelers` | entero >= 0 o `null` | Cupo por lado (KIN-775): tope de cabeceros y de pialadores. `null` = ese lado no tiene tope propio (también en una web anterior: se entiende «sin cupo por lado»). Cada uno es **<= `capacity`** y `0` significa nadie de ese lado. La web los llena con «igual por lado» o «por lado» y guarda como `capacity` la suma. Un lado lleno manda a la lista de espera aunque el evento tenga lugar. La lista de espera y `registrations_count` no cambian. La app los trata como espejo de solo lectura. |
| `max_roper_rating` | número (0 a 10, un decimal) o `null` | Rating máximo individual para inscribirse (KIN-638); `null` = sin límite. La web no deja inscribir a quien lo rebase (rating de la modalidad del evento). La app lo guarda en el evento importado y le pone el mismo tope a su roster. Campo opcional: una web anterior no lo manda. |
| `draw_type` | `round_robin` \| `lazada_sorteada` | Tipo de sorteo del evento casual (KIN-648/649). Los eventos que ya existían son `round_robin`. Lo fija quien crea el evento y **no cambia** una vez que hay inscritos o resultados. Campo opcional: una web anterior no lo manda y la app entiende `round_robin`. |
| `lazada_shots_per_package` | entero >= 1 o `null` | Solo en `lazada_sorteada`: tiros que trae un paquete (uno por evento). Tiros de una persona en un rol = `registrations[].packages` * este valor. `null` en `round_robin` o mientras el organizador no lo define. |
| `rounds` | entero 1 a 10 o `null` | Rondas del evento (KIN-655). **Es el total e incluye el short-go** (KIN-777): 3 rondas con short-go son 2 normales + 1 short-go; no se manda `rounds` + 1. `null` = el organizador aún no las define: la app importa su valor por defecto (3). Aplica a los dos tipos de sorteo. No cambia una vez que hay resultados (`rounds_locked`). Campo opcional: una web anterior no lo manda y se entiende `null`. |
| `short_go` | booleano | Si la última de las `rounds` es el short-go (KIN-777), igual que `event.short_go` de la app. Siempre va explícito. **Ausente (web anterior) = `true`**, el valor por defecto de la app, así los eventos viejos no cambian. Con `true` y `rounds` definido, `rounds` es >= 2 (al menos una ronda normal más el short-go). No cambia una vez que hay resultados (`rounds_locked`). La app lo trata como espejo de solo lectura. |
| `max_team_rating` | número (0 a 20, un decimal) o `null` | Rating máximo de la SUMA de un equipo (cabecero + pialador); `null` = sin tope. **Solo aplica a `lazada_sorteada`** (KIN-776): en `round_robin` va siempre `null`, aunque la web tenga un valor guardado de antes. En Lazada Sorteada la app lo usa como restricción dura al sortear. Distinto de `max_roper_rating`, que es el individual. |
| `updated_at` | fecha ISO-8601 UTC | Último cambio del evento, sus inscripciones o sus categorías. |
| `categories[].fee_cents` | entero >= 0 | Montos SIEMPRE en centavos. |
| `registrations[].id` | UUID | Id de la inscripción. Una persona puede tener una por categoría y rol (ver `role`). |
| `registrations[].roper_global_id` | UUID | `global_id` del participante (el mismo de `GET /api/app/participantes`). Si su perfil se fusionó con otro, es el del perfil vigente. |
| `registrations[].category_id` / `category` | UUID / texto, o `null` | Categoría elegida. |
| `registrations[].payment_status` | `pendiente` \| `pagado` \| `reembolsado` | Una inscripción `pendiente` también ocupa lugar. |
| `registrations[].amount_cents` | entero >= 0 | Lo que se cobró por esa inscripción, en centavos. |
| `registrations[].payment_method` | `efectivo` \| `transferencia` \| `stripe` o `null` | `null` mientras esté pendiente. |
| `registrations[].packages` | entero de 1 a 99 | Paquetes de tiros que compró en ESE rol (KIN-649). En Lazada Sorteada cada persona elige su rol al inscribirse (aunque su perfil tenga solo uno; el perfil no cambia) y, si elige los dos, cuántos paquetes compra como cabecero y cuántos como pialador (KIN-793): llega UNA inscripción por rol, cada una con su `role` y sus `packages` (por ejemplo 2 de cabecero y 0 de pialador llega como una sola inscripción de cabecero con `packages: 2`); un lado en 0 no genera inscripción. El contrato no cambia. Siempre 1 fuera de `lazada_sorteada`. El `amount_cents` de la inscripción es el costo de la categoría * `packages`. Campo opcional: una web anterior no lo manda y se entiende 1. |
| `registrations[].role` | `header` \| `heeler` o `null` | Rol con el que entra a ESTE evento (KIN-623). Es por inscripción y no cambia el perfil. `null` si la persona aún no definió su rol. |
| `waitlist` | lista | Lista de espera del evento (KIN-726), en orden de llegada: quienes quisieron entrar con el cupo lleno. **No ocupan cupo, no se cobran y no están en `registrations`.** Vacía si nadie espera. Campo opcional: una web anterior no lo manda y se entiende vacío. |
| `waitlist[].id` | UUID | Id de la entrada de espera (no es el de una inscripción: al pasar a inscrita nace una inscripción nueva con otro `id` y la entrada desaparece). |
| `waitlist[].roper_global_id` | UUID | `global_id` de la persona (el mismo de `GET /api/app/participantes` cuando la persona ya está inscrita; **mientras solo espera, esa API no la trae**, porque la app mete al roster a todo el que devuelve). |
| `waitlist[].name` | texto | Nombre de la persona. Nunca correo ni celular. |
| `waitlist[].category_id` / `category` | UUID / texto | Categoría a la que quiere entrar. |
| `waitlist[].role` | `header` \| `heeler` o `null` | Rol con el que espera. Quien eligió "los dos" aparece **dos veces** (una por rol), como en las inscripciones. |
| `waitlist[].packages` | entero de 1 a 99 | Paquetes de tiros que compraría en ese rol (solo `lazada_sorteada`; 1 en los demás). |
| `waitlist[].position` | entero >= 1 | Lugar en la fila **del evento** (1 = el siguiente). Es el orden de llegada, no se guarda: se calcula en cada respuesta. |
| `waitlist[].joined_at` | fecha ISO-8601 UTC | Cuándo se anotó. |

Las inscripciones NO llevan correo ni celular: para eso está `GET /api/app/participantes` (que sí exige organizador activo y evento propio).

**Tipo de sorteo y paquetes (KIN-648/649, 2026-11-19).** Hoy hay dos tipos, ambos de eventos casuales: `round_robin` y `lazada_sorteada`. Quien crea el evento (la web o la
app, que lo sube) fija el tipo; la web no deja cambiarlo ni cambiar los tiros por paquete con inscritos o resultados (`draw_type_locked`). En Lazada Sorteada cada
inscripción lleva los paquetes que compró en ese rol; con "los dos" roles son dos inscripciones, cada una con sus paquetes y su monto. Los paquetes no ocupan más
lugares del cupo: el cupo cuenta inscripciones. Son campos nuevos opcionales: no suben `contract_version`.

**Rol por inscripción (KIN-623).** Quien tiene el rol "Ambos" en su perfil elige, al inscribirse, cabecero, pialador o los dos. "Los dos" son
**dos inscripciones** de la misma persona y categoría, una con `role: "header"` y otra con `role: "heeler"`, cada una con su `id`, su lugar en el cupo
y su propio `amount_cents` (se cobran dos inscripciones). La app debe tratar cada inscripción como una entrada distinta: la misma `roper_global_id` puede
aparecer dos veces en una categoría, con roles distintos. Quien tiene rol cabecero o pialador en su perfil entra con ese; quien no tiene rol viene con `null`.
Puede cambiar el rol de una inscripción mientras las inscripciones sigan abiertas, y eso mueve `updated_at` del evento como cualquier cambio de inscripción.

**Inscritos que el organizador saca del evento (KIN-621).** Sacar a alguien borra su inscripción (el motivo y el pago quedan en un registro de la web
que la app no recibe). Para la app, esa persona simplemente **deja de venir** en `registrations`, y como la web mueve `updated_at` del evento
con cualquier alta, cambio o baja de inscripciones, el evento vuelve a descargarse en la siguiente sincronización incremental. La app debe tratar
`registrations` como la lista completa vigente del evento (reemplazarla, no solo agregar): una inscripción que ya no viene es una baja. Un inscrito
que ya tiene resultados no se puede sacar desde la web. Si la persona vuelve a inscribirse (con permiso del organizador), llega con una
inscripción nueva y otro `registrations[].id`. `GET /api/app/participantes` tampoco la trae mientras no tenga ninguna inscripción en ese evento (estar en la lista de espera no cuenta).

**Lista de espera y cupo (KIN-726, 2026-11-24).** `capacity` es el cupo del evento y cuenta **inscripciones** (con "los dos" roles son dos). Cuando se llena, quien quiere
entrar queda en `waitlist` en vez de rechazarse: no ocupa lugar, no tiene monto ni pago y no sale en `registrations` ni en las listas públicas de inscritos. Reglas:

- **Pasar a alguien de la espera a inscrito lo hace el organizador, a mano**, y solo si hay lugar (`inscripciones < capacity`). Nace una inscripción `pendiente` con el monto
  de la categoría * paquetes, la entrada de espera desaparece y la persona recibe un aviso dentro de la web y por correo. No hay promoción automática.
- Si alguien cancela o el organizador lo saca, el lugar queda libre pero **nadie entra solo**: la web no mueve a nadie sin que el organizador lo haga.
- Cualquier cambio de la lista (alguien entra, sale, lo quitan o lo pasan a inscrito) mueve `updated_at` del evento: baja completo en la siguiente sincronización incremental, con
  `registrations` y `waitlist` vigentes. La app trata las dos listas como la lista completa (reemplaza, no suma): una entrada que ya no viene es una baja.
- Una persona en espera **no cuenta** en el cupo ni en los pagos. Una inscripción nueva de la misma persona (mismo evento, categoría y rol) borra su entrada de espera.
- El rating máximo individual (`max_roper_rating`) también aplica a la espera: quien lo rebasa no entra a la lista.
- La web hoy no deja que la app cambie `capacity` ni la lista de espera: **la web es la fuente de verdad** de los eventos que ya están vinculados. Mover a alguien desde la app
  hacia la web (el "al revés" de KIN-726) queda para una entrega aparte y necesita un endpoint nuevo; mientras tanto la app muestra la lista de espera de la web de solo lectura.
- Campo nuevo y opcional: no sube `contract_version`.

Errores (todos con `{ "code": "…", "error": "texto para personas" }`; la app decide con `code` y el HTTP, no con el texto):

| HTTP | `code` | Cuándo | ¿Reintentar? |
|---|---|---|---|
| `400` | `invalid_field` | `since`, `cursor` o `X-Contract-Version` mal formados | no, es un error de la app |
| `401` | `invalid_token` | token inválido o revocado | no. La app pide reconectar en Ajustes → Cuenta web |
| `403` | `organizer_not_active` | el organizador no tiene licencia vigente ni aprobación manual | no, hasta que lo activen |
| `426` | `version_unsupported` | la web ya no acepta esa versión del contrato | no, hay que actualizar la app |
| `429` | `rate_limited` | demasiados intentos con un token inválido. Trae `Retry-After` (segundos) | sí, esperando `Retry-After` |
| `503` | `service_unavailable` | falla temporal de la web o de la base | sí, con espera creciente |

Orden de las comprobaciones: token de la sesión (`401`/`429`/`503`), versión y parámetros (`400`/`426`), organizador activo (`403`).

## Subir un evento creado en la app: `POST /api/app/eventos` (KIN-648, entrega 2)

La app (donde se creó el evento, con su serie) lo sube a la web para que el organizador lo revise, lo complete y lo publique. Ejemplos versionados:
[`sync-examples/evento-subida.request.json`](sync-examples/evento-subida.request.json) y [`sync-examples/evento-subida.response.json`](sync-examples/evento-subida.response.json).

- **Solo eventos casuales** (hoy `round_robin` y `lazada_sorteada`) y solo modalidad `lazo`. Los profesionales llegan después.
- **El evento nace SIEMPRE como `borrador`.** La app nunca publica: el organizador completa en la web lo que la app no sabe y lo publica. Un borrador no aparece
  en `GET /api/app/eventos` ni en el sitio público; cuando el organizador lo publica, llega a la app con el mismo `id` que la respuesta de esta subida, así que la app
  lo reconoce (`event.remote_id`) y no lo trata como evento nuevo.
- **Serie y evento van juntos.** `series` es OBLIGATORIA (KIN-659: un evento vive siempre dentro de una serie; sin ella, `400 series_required`). La serie se vincula por `series.app_id` (el uuid de la serie en la app), nunca por
  nombre: si ya existe una serie de este organizador con ese `app_id` se reutiliza (y NO se modifica); si no, se crea con la plantilla vacía (ciudad, sede, cupo,
  modalidades y categorías las completa el organizador en la web antes de agregar eventos desde allá). La fecha del evento debe caer dentro de las fechas de la serie.
- **Idempotente.** `event.app_id` (el uuid del evento en la app) es único por organizador. Reenviar el mismo evento (por ejemplo tras un corte) responde `200` con el
  mismo `id` y `slug` y **no modifica nada**: después de crearse, la web es la fuente de verdad (inscritos, pagos, ediciones del organizador). La app no actualiza
  eventos ya subidos por este endpoint.
- **Serie ya conocida.** Si la app ya sabe cuál es la serie en la web (porque vino de ella o porque una subida anterior la creó), manda también `series.id` (el id de la
  web). Entonces se usa esa serie —debe ser de este organizador, si no `422 series_not_found`— y no se crea ni se modifica nada de ella.
- La web asigna `id` y `slug`; la app los guarda como `event.remote_id` y `event.remote_slug` (y los de la serie como `series.remote_id` y `series.remote_slug`).

Cuerpo:

| Campo | Tipo | Notas |
|---|---|---|
| `contract_version` | entero | Hoy `1`. |
| `event.app_id` | UUID | `event.uuid` de la app. |
| `event.name` | texto | 1 a 120 caracteres. |
| `event.date` | `AAAA-MM-DD` | Fecha real. |
| `event.venue` | texto o `null` | El «lugar» de la app (hasta 120). La app no separa ciudad: `city` queda vacío en la web. |
| (arenas) | — | KIN-751: en la web cada organizador tiene un catálogo de arenas y el evento queda enlazado a una (`events.arena_id`). `GET /api/app/eventos` ya manda esa arena en `arena` (ver «Arena del evento»); `venue` y `city` siguen siendo el nombre y la ciudad de esa arena. Un lugar que llega escrito desde la app se enlaza solo con la arena del organizador que tenga la misma llave (sin mayúsculas, acentos ni signos) o crea una nueva; el texto que mandó la app no se toca. |
| `event.disciplines` | `["lazo"]` | Solo modalidades activas. |
| `event.draw_type` | `round_robin` \| `lazada_sorteada` | Ver `GET /api/app/eventos`. |
| `event.rounds` | entero 1 a 10 o `null` | Rondas del evento en la app (su base solo admite de 1 a 10). Opcional. |
| `event.lazada_shots_per_package` | entero 1 a 999 o `null` | Solo con `lazada_sorteada`; es un error mandarlo con `round_robin`. |
| `event.max_roper_rating` / `event.max_team_rating` | número (0 a 10 / 0 a 20) o `null` | Topes individual y por equipo. |
| `event.entry_fee_cents` | entero >= 0 | Cuota de la app, en centavos. Se crea una categoría **General** con ese costo; el cupo queda sin límite (`capacity` `null`). |
| `series.app_id` / `name` / `start_date` / `end_date` | UUID / texto (2 a 120) / fechas | `end_date` no antes que `start_date`. |
| `series.id` | UUID, opcional | Id de la serie en la web, si la app ya lo conoce. |

Respuesta `201` (se creó) o `200` (ya existía): `{ contract_version, created, event: { id, slug, status: "borrador" }, series: { id, slug, created } }`.

| HTTP | `code` | Cuándo | ¿Reintentar? |
|---|---|---|---|
| `400` | `invalid_json`, `invalid_body`, `invalid_field` | Cuerpo mal formado o un campo fuera de rango | no, es un error de la app |
| `401` | `invalid_token` | Token inválido, revocado o vencido | no, pide reconectar |
| `403` | `organizer_not_active` | La cuenta no es de organizador activo | no |
| `413` | `payload_too_large` | Más de 8 KB | no |
| `400` | `series_required` | Falta `series`. La subida desde la app sigue exigiéndola; los eventos individuales se crean en la web (KIN-750) | no |
| `422` | `outside_series` | La fecha del evento cae fuera de las fechas de su serie | no, la app avisa |
| `422` | `series_not_found` | `series.id` no existe o es de otro organizador | no |
| `422` | `series_full` | La serie ya tiene 30 eventos en la web | no |
| `409` | `slug_taken` | Choque raro de enlaces | sí, de inmediato (la web genera otro) |
| `426` | `version_unsupported` | La web ya no habla esa versión | no, pide actualizar |
| `429` / `503` | `rate_limited` / `service_unavailable` | Igual que el resto de la API | sí, con espera |

## `GET /api/app/participantes?event_id=<uuid>&since=<ISO-8601>&cursor=<texto>`

**La sincronización de participantes es SIEMPRE por evento (decisión del 2026-11-05).** No existe un modo "todo el
directorio": devuelve solo a las personas inscritas (**no** a quien solo está en lista de espera: la app mete al roster a todo el que devuelve esta API; la espera viaja aparte en `waitlist[]` de `/api/app/eventos`) en UN evento del organizador del token de la sesión. Con decenas de
miles de lazadores, bajar todo sería enorme y expondría correos de gente ajena a ese organizador. Reglas:

- `event_id` es **obligatorio** (el `id` del evento en la web, el mismo que entrega `GET /api/app/eventos`). Sin él, `400`.
- El evento debe ser del organizador del token. Si no existe o es de otro, `404` (sin revelar si existe).
- Solo organizadores **activos** (licencia vigente o aprobación manual). Si no lo es, `403` con un mensaje claro y sin correos.
- La identidad es el **correo** (único y en minúsculas). El celular ya no es llave ni se verifica, y no se envía.
- `since` y `cursor` son por evento: la app guarda un `since` distinto para cada uno. `generated_at` es el corte de la
  consulta; la app lo guarda como el próximo `since` solo si recibió todas las páginas.
- `ratings` trae un rating (escala de 1 a 10, un decimal) POR modalidad **activa** (hoy solo `lazo`). Quien aún no tiene rating en
  una modalidad viene con el rating inicial (1, igual que se muestra en la web), `events: 0`, `wins: 0` y `updated_at: null`. Las
  modalidades que la web no tiene activas no se envían. **El rating de partida lo declara el lazador al crear su cuenta** (KIN-663, migración 0040):
  se guarda como su rating en `lazo` con `events: 0` y `wins: 0`, así que llega aquí sin ningún campo nuevo. Si un organizador ya le había puesto un
  rating a ese perfil antes de que reclamara su cuenta, ese gana. La web no deja editarlo desde la cuenta; la fórmula que lo recalcula con
  resultados sigue en pausa (KIN-571 y KIN-583).
- Cada participante lleva solo `global_id`, `short_id`, `name`, `email`, `claimed`, `role`, `favorite_role` y `ratings`. Nunca celular ni ids de cuenta.
- `short_id` (KIN-752, migración 0051) es el **ID corto** que se comparte entre personas: `RM-` y un número con al menos 4 dígitos (`RM-0001` ... `RM-9999` y después
  `RM-10000`, sin cambiar el formato). Lo asigna la web al crear el perfil, es único, **nunca se reutiliza ni cambia** y se ve en el perfil público. **No sustituye a `global_id`**: la
  identidad para ligar personas sigue siendo `global_id` (y el correo). No es el `public_id` que el crossplay de la app guarda en cada base local (otro valor, por instalación).
  Campo opcional: una web anterior no lo manda; una persona sin ID legible llega con `null`. La app puede mostrarlo y buscar por él.
- `role` es con qué rol compite (KIN-622): `header` (cabecero), `heeler` (pialador) o `both` (ambos); `favorite_role` es `header` o `heeler` y **solo viene
  cuando `role` es `both`** (el rol que usa más). Los perfiles que aún no eligen rol traen los dos en `null` ("sin definir"); la app no debe bloquearlos.
  Son los mismos `header` / `heeler` de `substitution.role`. Cambiar el rol cuenta como cambio del participante para `since`.
- Un perfil fusionado (`merged_into`) no se incluye.

```json
{ "participants": [{ "global_id": "…", "short_id": "RM-0042", "name": "…", "email": "ana@example.com", "claimed": true, "role": "both", "favorite_role": "heeler",
                     "ratings": { "lazo": { "rating": 9.4, "events": 18, "wins": 6, "updated_at": "2026-11-01T00:00:00Z" } } }],
  "next_cursor": null, "generated_at": "2026-11-05T10:00:00Z" }
```

Ejemplo completo y versionado, para las pruebas de la web y de la app: [`sync-examples/participantes.response.json`](sync-examples/participantes.response.json).

**Paginación y corte.** Cada página trae hasta 200 personas ordenadas por su último cambio. Si hay más, `next_cursor` trae un
texto opaco que la app manda tal cual en `?cursor=`, junto con el mismo `event_id` y `since`. Todas las páginas de una descarga
comparten el mismo `generated_at` (el de la primera). Un participante cuenta como "cambiado" cuando cambia su perfil, su correo o su
estado de reclamo, sus ratings o su inscripción en ese evento. `since` es inclusivo: reenviar a alguien dos veces es inofensivo.

| HTTP | Cuándo | ¿Reintentar? |
|---|---|---|
| `200` | Página entregada (puede traer `participants: []`) | no hace falta |
| `400` | Falta `event_id`, o `event_id`, `since` o `cursor` no son válidos | no, es un error de la app |
| `401` | Token inválido o revocado | no, hay que reconectar |
| `403` | El organizador no está activo (sin licencia vigente ni aprobación) | no, hasta que lo apruebe un admin |
| `404` | El evento no existe o no es del organizador (no se distingue) | no |
| `429` | Demasiados intentos con un token inválido (trae `Retry-After`) | sí, después de esperar |
| `503` | Falla temporal | sí |

Las respuestas llevan `Cache-Control: no-store`. Los correos nunca se escriben en los registros del servidor.

Estado: implementada (KIN-586). La app la usa desde KIN-592 con este mismo formato.

## Subida de resultados (contrato v1)

Estado: **implementada en la web** (KIN-587): `POST /api/app/resultados`, `POST /api/app/eventos/<id>/cierre` y `POST /api/app/eventos/<id>/reabrir`.
La app la usará desde KIN-593. Los ejemplos JSON completos están en [`docs/sync-examples/`](sync-examples/); la web los usa como datos de
prueba (`npm run test:db` y `npm run test:unit`) y la app debe poder reproducirlos tal cual.

**Lazada Sorteada (2026-11-20).** Se sube igual que Round Robin: un resumen por lazador cuyo `place` es el mejor lugar entre las parejas con las que corrió y con todos sus tiros dentro de `rounds`. Como cada persona corre tantos tiros como paquetes compró, el tope subió de 20 a 100 rondas por resultado (cambio compatible: una web anterior rechaza con `invalid_field` los resultados de más de 20 rondas). `packages` y `shots` viajan como campos opcionales; el tipo de sorteo no se manda porque la web ya lo tiene en el evento.

Decisiones (2026-11-06): un resultado de alguien **sin lazador en la web** se acepta igual, solo para el evento y sin ligarlo a nadie; un
evento **cerrado** no cambia hasta reabrirlo con un motivo, y reabrir se hace **desde la app**; reabrir **no** cambia el estado del evento.

### Versión del contrato
- El cuerpo de cada petición lleva `contract_version` (entero) y la respuesta lo repite. Hoy es `1`.
- Cambios compatibles (campos nuevos opcionales) NO suben la versión: quien lee ignora lo que no conoce.
- Si la app manda una versión que el servidor ya no acepta, o el servidor responde una versión mayor que la que la app entiende:
  respuesta `426 Upgrade Required` (código `version_unsupported`). La app deja de sincronizar, conserva su cola intacta y
  muestra "actualiza la app". No descarta nada.

### `POST /api/app/resultados`
Sube un lote de resultados. Misma autenticación `Authorization: Bearer <token>`.

Campos del cuerpo: `contract_version`, `client_batch_id` (UUID del envío, solo para bitácora) y `results[]`.

**Un resultado es un RESUMEN por lazador y por evento, con sus rondas por dentro** (decisión del 2026-11-06). El resumen trae el lugar (lo
calcula la app con su propia clasificación, sea round robin o con final), el tiempo total y los contadores; `rounds` trae el detalle de las
rondas que **sí se intentaron**. Lo que no se intentó (pendiente, no se presentó, retirado, saltado) **no se manda**. Un **no time cuenta como
intento fallido**: va en `rounds` con estado `no_time` y suma en `nt_count`. Las **corridas extra**, las **ayudas** y los **desempates** también se
mandan y se muestran con su etiqueta, para que se sepa que fueron así, pero **no entran al resumen** (ni al tiempo total ni a los contadores): el
resumen sale solo de las rondas `regular` de etapa `preliminary` o `final`. Quien corrió en **sustitución** de alguien se anota dentro de esa ronda
(la corrida se queda con el lazador original). El **rating no se calcula** todavía (KIN-571 y KIN-583, en pausa):
las rondas se guardan para cuando se defina la fórmula, y reenviar el resumen o corregir una ronda actualiza el mismo resultado.

| Campo del resultado | Tipo | Regla |
|---|---|---|
| `id` | UUID | Lo genera la app y no cambia nunca. Es la llave de idempotencia |
| `revision` | entero >= 1 | La app lo sube en 1 cada vez que corrige ese resultado |
| `event_id` | UUID | Id del evento en la web (el mismo `id` que recibió en `GET /api/app/eventos`) |
| `roper_global_id` | UUID o `null` | `global_id` del participante en el directorio. `null` si la persona no tiene lazador en la web (ver abajo) |
| `participant_name` | texto (1 a 120) | **Obligatorio si `roper_global_id` es `null`**; si hay lazador ligado se ignora |
| `discipline` | texto | `lazo` o `barriles`. Solo las modalidades activas en la web |
| `time_ms` | entero o `null` | >= 0. **Tiempo total del evento**: la suma de los tiempos de las rondas completadas. `null` si no completó ninguna |
| `penalty_ms` | entero | >= 0. Suma de los castigos. Ya viene separado: el tiempo final es `time_ms + penalty_ms` |
| `disqualified` | booleano | Descalificado de TODO el evento, sin lugar: si es `true`, `place` debe ser `null`. La app hoy no descalifica de un evento completo y manda `false`; las descalificaciones por ronda van en `rounds` y en `dq_count` |
| `place` | entero o `null` | Lugar >= 1 dentro de esa modalidad y evento, tal como lo calculó la app (con rondas preliminares y final). `null` si no puntúa |
| `completed_runs` | entero >= 0 | Rondas regulares completadas (preliminares y final; sin extras, ayudas ni desempates). Opcional si viene `rounds` (se calcula de ahí; si la app también lo manda, debe coincidir) |
| `nt_count` | entero >= 0 | Rondas con no time. Igual que el anterior |
| `dq_count` | entero >= 0 | Rondas con descalificación. Igual que el anterior |
| `packages` | entero 1 a 198 o ausente | Paquetes de tiros que compró en total (Lazada Sorteada, KIN-648; hasta 99 por rol). Opcional e informativo; no afecta el resumen |
| `shots` | entero 1 a 9999 o ausente | Tiros que le tocaban en total (paquetes por tiros de cada paquete). Opcional e informativo |
| `rounds` | lista (máx. 100) | Las rondas que se intentaron (ver abajo). Opcional: sin ella solo queda el resumen |
| `recorded_at` | fecha ISO-8601 | Cuándo se capturó en la app. Informativo |

Cada elemento de `rounds`:

| Campo | Tipo | Regla |
|---|---|---|
| `round` | entero 1 a 100 | Número de ronda. Las `regular` no repiten número dentro de la misma `stage`; las `extra` y `help` sí pueden |
| `stage` | `preliminary`, `final` o `tiebreak` | Etapa. Si falta, `preliminary` (sirve para saber quién llegó a la final). `tiebreak` es una ronda de desempate |
| `kind` | `regular`, `extra` o `help` | Si falta, `regular`. `extra` es una corrida extra y `help` una ayuda de una vacante del sorteo |
| `status` | `completed`, `no_time` o `disqualified` | `completed` exige `time_ms`; los otros dos exigen `time_ms: null` |
| `time_ms` | entero o `null` | >= 0 |
| `penalty_ms` | entero | >= 0. Por defecto 0 |
| `substitution` | objeto, opcional | Quién corrió en sustitución en esa ronda (ver abajo). `null` equivale a no ponerlo |

**Varias corridas en una misma ronda (KIN-629).** Un lazador puede tener muchas corridas en la misma ronda (se le asignan tiros y tira varias
veces). Como una ronda `regular` no se repite dentro de la misma `stage`, hoy solo la primera corrida va como `regular` y las demás de esa ronda
llegan como `extra`, igual que una corrida extra real (el botón de la app, KIN-548): con este contrato **la web no las puede distinguir**.
Por eso la web no trata `extra` como "corrida extra" cuando la ronda ya tiene una `regular`: las agrupa por `stage` y `round`, pone la `regular`
primero y las numera ("Ronda 1 · Corrida 2"), sin tag. Solo etiqueta "Corrida extra" cuando esa ronda no tiene ninguna `regular`. Ninguna entra
al resumen. **Limitación:** una corrida extra real que comparta ronda con una `regular` se ve igual que otra corrida de esa ronda.
Pendiente con la app: si se quiere distinguirlas, el contrato necesita un campo propio (por ejemplo el número de corrida dentro de la ronda
o una marca de "corrida extra del botón"); es un cambio de contrato (`contract_version`), no solo de la web.

`substitution`: `role` (`header` o `heeler`: qué lugar del equipo ocupó el sustituto), `substitute_name` (1 a 120, obligatorio),
`substitute_global_id` (UUID o `null` si no tiene lazador en la web) y `counts_for_substitute` (booleano, por defecto `false`: si la corrida también
cuenta para el sustituto). La corrida se queda con el lazador original: **no se crea un resultado aparte para el sustituto**.

La web guarda las rondas siempre en el mismo orden (regulares, luego extras, luego ayudas; dentro, preliminares, final y desempates), así que
reenviar las mismas en otro orden responde `unchanged`. Si una ronda no cumple las reglas, o los contadores no coinciden con las rondas que cuentan,
el resultado se rechaza con `invalid_field`.

**Tamaño del lote:** máximo 200 resultados y 256 KB por petición. Si se pasa, `413`: la app parte el lote en mitades y reenvía.

**Respuesta (`200`)**: una entrada por resultado, en el mismo orden, para que un resultado malo no tire el resto.

| `status` | Significa | La app |
|---|---|---|
| `accepted` | Se guardó por primera vez | Marca el resultado como enviado |
| `unchanged` | Ya estaba igual (reenvío) | Marca como enviado |
| `updated` | Se aplicó una corrección (`revision` mayor) | Marca como enviado |
| `rejected` | No se guardó. Trae `code`, `message` y `retry` | Si `retry` es `false`, lo deja en estado "con error" visible y no lo reintenta solo |

Códigos de rechazo por resultado:

| `code` | Causa | `retry` |
|---|---|---|
| `invalid_field` | Un campo no cumple las reglas de la tabla (también: falta el nombre sin lazador, o el `id` ya es de otro evento) | no |
| `event_not_found` | El `event_id` no existe **o no es de este organizador** (no se distingue, para no revelar qué eventos existen) | no |
| `event_closed` | Los resultados del evento están cerrados y este cambia algo (ver abajo) | no, hasta reabrir |
| `roper_unknown` | Viene un `roper_global_id` que no existe en el directorio (si no hay lazador, se manda `null` y el nombre) | no |
| `discipline_inactive` | La modalidad no está activa en la web | no |
| `stale_revision` | Llegó una `revision` menor o igual con datos distintos a los guardados | no |
| `temporary_error` | Falla interna al guardar ese resultado | sí |

### Códigos HTTP del lote

| HTTP | Cuándo | ¿Reintentar? |
|---|---|---|
| `200` | Lote procesado (revisar el estado de cada resultado) | no hace falta |
| `400` | Cuerpo mal formado o campos obligatorios ausentes | no, es un error de la app |
| `401` | Token inválido o revocado | no. La app pide reconectar en Ajustes → Cuenta web |
| `403` | El organizador no está activo (sin licencia vigente ni aprobación) | no, hasta que lo apruebe un admin |
| `404` | Cierre o reapertura de un evento que no existe o no es del organizador | no |
| `409` | Conflicto a nivel de lote (solo en el cierre, ver abajo) | no, hay que corregir |
| `413` | Lote demasiado grande | sí, partido en mitades |
| `426` | Versión del contrato no soportada | no, hay que actualizar la app |
| `429` | Demasiadas peticiones. Trae `Retry-After` (segundos) | sí, esperando `Retry-After` |
| `5xx` | Falla del servidor | sí |

**Cuándo reintentar:** solo `413`, `429`, `5xx`, error de red y los resultados con `retry: true`. Espera creciente con variación
aleatoria: 30 s, 1 min, 2 min, 5 min, y desde ahí cada 15 min como máximo. Se reenvían los mismos `id`, así que reintentar
es seguro.

### Idempotencia y correcciones
- Mismo `id` con los mismos datos: `unchanged`. No se duplica nada.
- Mismo `id` con datos distintos y `revision` MAYOR a la guardada: es una corrección, se reemplaza y responde `updated`.
- Mismo `id` con datos distintos y `revision` menor o igual: `rejected` con `stale_revision`. Evita que un reenvío viejo
  que llega tarde pise una corrección más nueva.
- El servidor guarda la `revision` junto al resultado (columna nueva, aditiva, en `event_results`).
- Un resultado nunca se borra por este canal. Para quitar uno, la app lo manda con `disqualified: true` y `place: null`, o se
  borra desde la web por el organizador (fuera de este contrato).
- **Evento con los resultados cerrados:** reenviar un resultado **idéntico** responde `unchanged` (inofensivo, por ejemplo un envío viejo que
  llega tarde). Un resultado nuevo o con datos distintos responde `event_closed` hasta que el evento se reabra.

### Resultados de gente sin lazador en la web
Si la persona no tiene lazador en la web, la app manda `roper_global_id: null` y `participant_name`. El resultado se **acepta** y queda
**solo para el evento**: se ve en sus resultados, pero no se liga a nadie, así que no afecta ratings, perfiles ni historial de ninguna persona.
Si la app manda un `roper_global_id` que **no existe**, sigue siendo error (`roper_unknown`): eso es un dato malo, distinto de "no hay lazador".
La web muestra el nombre y el tiempo de esas personas, así que el Aviso de Privacidad debe cubrirlo.

### Cerrar un evento: `POST /api/app/eventos/<event_id>/cierre`
El evento pasa a `finalizado` y se pone el **candado de los resultados** (`events.results_closed_at`). **El recálculo de ratings NO es parte
de este contrato**: está en pausa hasta definir la solución (KIN-571 y KIN-583). Cerrar solo cambia el estado y el candado; cuando exista el
cálculo, se enganchará aquí sin cambiar la forma de la petición. Cuerpo: `{ "contract_version": 1, "expected_results": <n> }`.

- `expected_results` es el total de resultados que la app tiene para ese evento. Si el servidor tiene otra cantidad:
  `409` con `code: "incomplete"` y `results_count`, y **no se cierra**. La app reenvía lo que falte y vuelve a cerrar. Así un cierre nunca
  deja resultados a medias.
- Cerrar un evento ya cerrado responde `200` con `already_closed: true` (es idempotente).
- La respuesta no trae ratings. Los ratings siguen saliendo de `GET /api/app/participantes` con los valores que tenga la web.
- Un evento que no existe o no es del organizador responde `404` (no se distingue). Cada cierre queda en la bitácora.

### Corregir un evento ya cerrado: `POST /api/app/eventos/<event_id>/reabrir`
Cuerpo: `{ "contract_version": 1, "reason": "texto" }`. El motivo es **obligatorio** (de 5 a 500 caracteres) y queda en la bitácora.

- **Se hace desde la app.** Al desbloquear un evento finalizado se pide el motivo; la app reabre, reenvía lo corregido (con `revision` mayor)
  y vuelve a cerrar. La web solo guarda y muestra el estado y la bitácora; no tiene un botón para reabrir.
- **Reabrir NO cambia el estado del evento**: solo quita el candado de los resultados. El evento sigue `finalizado`, porque en la web
  `publicado` es lo que permite inscribirse, y reabrir no debe volver a abrir las inscripciones de un evento pasado.
- Reabrir uno ya abierto responde `200` con `already_open: true`. Sin motivo suficiente, `400` con `code: "reason_required"`.

### Pruebas
Los archivos de `docs/sync-examples/` forman los casos base. Web y app deben poder reproducirlos tal cual:

| Caso | Archivos |
|---|---|
| Primer envío: 3 aceptados (uno de ellos **sin lazador en la web**) y 1 rechazado (`roper_unknown`). Reenviarlo da `unchanged` en los 3 | `resultados.request.json` / `resultados.response.json` |
| Corrección con `revision` 2 | `resultados.correccion.request.json` / `resultados.correccion.response.json` |
| Cierre del evento | `cierre.request.json` / `cierre.response.json` |
| Reabrir con motivo | `reabrir.request.json` / `reabrir.response.json` |
| Lo que devuelve `GET /api/app/participantes` | `participantes.response.json` |

### Cómo encaja con la app y con la web (revisado contra el código)
Revisado contra el esquema de la web (`supabase/migrations`) y el de la app (`roping-manager-tauri/src-tauri/migrations`).

**Lo que ya cuadra**
- `event_results` ya existía en la web con `id` UUID, `event_id`, `roper_id`, `discipline`, `time_ms`, `penalty_ms`, `disqualified`.
- La app ya tiene UUID estable para eventos (`event.uuid`, migración 0023) y para lazadores (`roper.public_id`).
- Los tres endpoints ya existen en la web (KIN-587), con la migración 0021: `event_results` ganó `revision`, `place`, `recorded_at`,
  `participant_name`, `updated_at` y `uploaded_by`, `roper_id` dejó de ser obligatorio (resultados sin lazador), `events` ganó el candado
  `results_closed_at`, y hay bitácoras de lotes subidos y de cierres y reaperturas.

**Lo que falta o hay que ajustar (del lado de la app, KIN-593)**
3. **La app captura por EQUIPO, no por lazador.** Una corrida (`run`) es de un equipo (cabecero + pialador), no de una persona. El
   contrato es por lazador y por evento, así que cada equipo genera dos resultados (uno por integrante) con el mismo resumen del equipo
   y las mismas rondas. El `id` de cada resultado se genera una vez por (evento, lazador) y se guarda en la cola de envío (`outbox`); no
   hace falta tocar la tabla `run`.
4. **Unidades:** la app guarda segundos con decimales (`time_sec`, `penalty`, `official_time_sec`, `REAL`). El contrato usa
   milisegundos enteros, así que la app redondea al convertir.
5. **Estados de la app:** `result_status` tiene `qualified`, `no_time`, `disqualified`, `rerun`, `dns`, `scratched`, `skipped`. El
   contrato solo distingue `disqualified` y tiempo `null`. Propuesta para v1: `qualified` envía tiempo; `no_time` envía
   `time_ms: null`; `disqualified` envía `disqualified: true`; `dns`, `scratched`, `skipped`, `rerun` y `pending` no se envían.
6. **Sustituciones:** si un sustituto corre en lugar de un integrante, el resultado debe ir al lazador que corrió, o al original
   según cuente la corrida (migraciones 0033 y 0055 de la app). Hay que acordar cuál.
7. **Vínculo de ids:** la app necesita guardar el id de la web de cada evento y lazador (`remote_id`, `global_id`). Es KIN-589.

### Preguntas abiertas (a resolver al aprobar)
1. ~~**Participantes que solo existen en la app.**~~ Resuelto (2026-11-06): se mandan con `roper_global_id: null` y `participant_name`, y quedan
   solo para el evento (ver "Resultados de gente sin lazador en la web").
2. **Fórmula del rating** (KIN-571): el recálculo está en pausa y no es parte de este contrato. Si la fórmula necesita datos que no
   están aquí (por ejemplo número de participantes por ronda), habrá que añadirlos de forma compatible.
3. **Límites** de 200 resultados y 256 KB: razonables para un evento típico, confirmar con un evento grande real.
4. **Autenticación:** este contrato asume el token de sesión por equipo (KIN-606). El valor fijo `APP_SYNC_TOKEN` solo
   debe existir en desarrollo.

## Resultados en vivo (KIN-787, H13.6)

La app manda la **foto completa** de la ronda que se está corriendo; la web la guarda (una fila por evento, cada foto reemplaza a la anterior) y la sirve a la
página pública, que la sondea cada 10–15 s (decisión 7 de KIN-782). No es un segundo sistema de resultados: los resultados siguen viajando por
`POST /api/app/resultados`; esto solo describe el avance de la ronda (turnos, quién lazó, quién falta). Todo aditivo: no sube `contract_version`.

### `POST /api/app/eventos/<event_id>/en-vivo`

Autenticación: sesión de la app. Con un token de evento (`rme_…`) necesita `results:write` y el evento debe ser el suyo (otro evento: `404`).
El evento debe estar publicado o finalizado y ser del organizador. Ejemplo: `docs/sync-examples/en-vivo.request.json` y `.response.json`.

| Campo | Tipo | Significado |
|---|---|---|
| `contract_version` | entero | `1` |
| `revision` | entero ≥ 1 | Solo sube. La app puede usar la hora en milisegundos. Reenviar la misma es inofensivo; una menor no pisa a una mayor |
| `round`, `rounds` | enteros | Ronda actual (1…`rounds`) y total de rondas. `rounds` incluye el Short Go, igual que `event.rounds` |
| `short_go` | booleano, opcional | `true` si la ronda que se corre es el short-go (la última de `rounds`, en un evento con short-go). Ausente o `false` = ronda normal (una app anterior no lo manda). La pantalla pública dice «Short-go» en lugar de «Ronda N de N» |
| `total`, `done` | enteros | Equipos de la ronda y cuántos ya pasaron (`0 ≤ done ≤ total`) |
| `current` | equipo o `null` | Quien está lazando; `null` antes de empezar y al terminar la ronda |
| `pending` | arreglo de equipos | **Todos** los que faltan, en orden de turno (cada quien necesita ver sus turnos aunque estén lejos) |
| `standings` | arreglo de equipos | Los que ya pasaron, de la mejor posición a la peor (sin tiempo, al final), ya ordenados por la app: la web no los reordena |

Un equipo es `{ "n": 3, "header": "…", "heeler": "…", "total_ms": 8200 | null }`: `n` es el turno (≥ 1), `total_ms` el tiempo acumulado en milisegundos
(`null` si aún no tiene). Los nombres se limpian (espacios y caracteres de control) y se recortan a 80 caracteres. **No viaja nada privado**: ni correos, ni
celulares, ni pagos. Límites: 256 KB por envío y 1000 equipos por lista.

| Respuesta | Cuándo |
|---|---|
| `200 { contract_version, event_id, revision, unchanged }` | Guardada (`unchanged: true` si ya tenía esa misma revisión) |
| `409 { code: "stale_revision", revision }` | La web ya tiene una más nueva (`revision` es la suya). La app deja de reintentar esa foto y manda la siguiente |
| `400` / `413` / `426` | Cuerpo inválido, demasiado grande o versión del contrato no soportada |
| `403 scope_denied` / `404` | Sin `results:write`; evento ajeno, inexistente o borrador |

### `GET /api/eventos/<event_id>/en-vivo` (público)

Sin autenticación. Devuelve la foto lista para la pantalla (`LiveSnapshot` de `src/lib/live.ts`): lo mismo que se mandó, más `name`, `venue` (arena y ciudad
del evento) y `updatedAt` (cuándo cambió por última vez). Responde con `ETag` (la revisión); con `If-None-Match` igual contesta `304` sin cuerpo.
`Cache-Control: public, s-maxage=5, stale-while-revalidate=10`, así que el costo no crece con los espectadores. `404` si el evento no tiene foto, es un
borrador, es privado o no existe (no se distinguen). `src/components/LiveView.tsx` es el consumo de referencia: sondea cada 5 s mientras la pestaña está
a la vista, conserva la última foto y avisa si se cae la conexión.

La página `/{lang}/eventos/{evento}/en-vivo` se enciende en producción con `LIVE_ENABLED=true`; en desarrollo siempre está encendida y, sin datos reales, muestra
la demostración.

## Subida de pagos (KIN-706)

Estado: **implementada en la web** (`POST /api/app/pagos`, migración `0053_pagos_de_la_app.sql`). La app la usa desde KIN-706 con este mismo formato.
Bajar los pagos ya existía: `GET /api/app/eventos` trae el estado de pago de cada inscrito (KIN-585) y la app lo registra como un pago "Pagado en la web".

**La app lleva abonos; la web guarda UN estado por inscripción.** Por eso la app sube un **resumen por persona y por evento** (no cada abono):
cuánto lleva pagado, cuánto debe, la forma del último pago, la fecha, la nota y, si alguien más pagó por esa persona, quién. Mismo
manejo que los resultados: lote, una respuesta por pago en el mismo orden, `revision` para corregir y reintentos seguros.

### `POST /api/app/pagos`
Misma autenticación `Authorization: Bearer <token>` y mismos límites que `/api/app/resultados` (200 pagos y 256 KB por lote).
Cuerpo: `contract_version`, `client_batch_id` (UUID, solo bitácora) y `payments[]`. Cada pago:

| Campo | Qué es |
|---|---|
| `id` | UUID estable del pago de esa persona en ese evento (la app lo guarda; se repite en cada reenvío) |
| `revision` | Entero ≥ 1. Sube cada vez que el pago de esa persona cambia en la app |
| `event_id` | El `id` del evento en la web |
| `roper_global_id` | El lazador (debe estar inscrito en ese evento) |
| `status` | `pagado` o `pendiente`. Un abono parcial es `pendiente` con `paid_cents` > 0 |
| `method` | `efectivo` o `transferencia` si está pagado; `null` si está pendiente |
| `paid_cents` | Lo pagado en total, en centavos (≥ 0) |
| `due_cents` | Lo que debe en total (informativo) |
| `paid_at` | Cuándo se pagó (ISO-8601); `null` si está pendiente |
| `note` | Nota libre, hasta 500 caracteres (opcional) |
| `paid_by_global_id` | Si otra persona pagó por esta: su `roper_global_id` (opcional) |

Respuesta `200`: `{ contract_version, client_batch_id, payments: [{ id, status, revision } | { id, status: "rejected", code, message, retry }] }`.
Estados: `accepted` (la web cambió), `unchanged` (ya estaba igual), `updated` (corrección con `revision` mayor) o `rejected`.

| `code` del rechazo | Significa | ¿Reintentar? |
|---|---|---|
| `invalid_field` | Un campo no cumple las reglas (estado/forma incoherentes, monto negativo, revisión < 1…) | no |
| `event_not_found` | El evento no existe o no es del organizador (no se distingue) | no |
| `registration_not_found` | Esa persona no está inscrita en el evento | no (hay que inscribirla en la web primero) |
| `roper_unknown` | `paid_by_global_id` no existe en la web | no |
| `paid_online` | Pagó en línea (Stripe) y la app dice otra cosa: **el pago en línea manda**, no se deshace desde la app | no |
| `refunded` | La inscripción está reembolsada | no |
| `stale_revision` | Llegó una `revision` menor o igual con datos distintos | no |
| `temporary_error` | Falla interna | sí |

**Varias inscripciones de la misma persona.** Alguien puede estar inscrito más de una vez en un evento (otra categoría, o como cabecero y
pialador). La app sigue mandando **un solo resumen por persona y evento**, con sus totales, y la web lo aplica así:
- `status`, `method`, `note`, `paid_at` y `paid_by_global_id` se aplican a todas sus inscripciones.
- `paid_cents` se reparte en orden de inscripción hasta el costo de cada una; el sobrante queda en la última. No se duplica.
- Las pagadas en línea (Stripe) y las reembolsadas **no se tocan**. El costo de las pagadas en línea se descuenta de `paid_cents` antes de
  repartir, así que `paid_cents` debe incluirlo.
- `paid_online` solo se responde si todas las no reembolsadas se pagaron en línea y la app no dice `pagado`; `refunded`, si todas están reembolsadas.

**Conflictos web vs app.**
- Pago **en línea (Stripe)**: gana la web. Si la app también dice `pagado` es `unchanged`; si dice otra cosa, `paid_online`. La app debe dejar el
  pago como lo bajó de la web y no volver a subirlo.
- Pago **manual** (efectivo o transferencia): gana la `revision` mayor. Quien marcó pagado en la web a mano y la app aún no lo había subido
  entra como `revision` 0: el primer envío de la app lo reemplaza. Para no pisar un cambio nuevo hecho a mano en la web, la app baja
  siempre primero el estado de la web (`GET /api/app/eventos`) y solo sube lo que cambió después.
- Un pago manual se puede **deshacer** subiendo `pendiente` con `revision` mayor (queda sin fecha de pago).

**Cola y reintentos (lado de la app).** Cada resumen de pago es una fila de la cola (`outbox`, una por persona y evento, con `id` estable);
`revision` sube cuando el pago cambia. Sin internet todo funciona y se manda solo al volver. Espera creciente con variación aleatoria: 30 s, 1 min,
2 min, 5 min y luego cada 15 min como máximo; solo se reintenta `413`, `429`, `5xx`, error de red y los `retry: true`.

Ejemplos: [`pagos.request.json`](sync-examples/pagos.request.json) y [`pagos.response.json`](sync-examples/pagos.response.json). La web los usa como
datos de prueba (`npm run test:db` y `npm run test:unit`) y la app debe poder reproducirlos tal cual.

## Lado de la app (pendiente)
- Guardar `events.remote_id` y `ropers.global_id` (columnas **nullable**, migración aditiva según
  `roping-manager-tauri/src-tauri/migrations/MIGRATIONS.md`) para que reimportar actualice y no duplique.
- Traer participantes **solo de un evento a la vez** (los eventos con `remote_id`), nunca el directorio completo.
- Coincidir participantes por `global_id`; si no existe, por **correo** en minúsculas (y nombre sin acentos como pista débil),
  siempre pidiendo confirmación del organizador: nunca se vincula ni se fusiona solo.
- Pantalla de Ajustes → Cuenta web (token) y botón Sincronizar.

## Modalidades
Los ids de modalidad son `lazo` y `barriles` (los mismos en `events.disciplines`, `event_results.discipline` y `ratings`).
La app debe mapear cada modo de juego local a su id; los modos que la web aún no activa se ignoran.

## Series de eventos (KIN-625)

La web permite armar series (un organizador agrupa hasta 30 eventos de una temporada). Cambio **aditivo** del contrato 1 (una app anterior ignora el campo):
cada evento de `GET /api/app/eventos` trae `series`:

```json
"series": { "id": "<uuid>", "slug": "temporada-norte-2026", "name": "Temporada Norte 2026", "start_date": "2026-01-01", "end_date": "2026-12-31" }
```

- `series` es `null` cuando el evento es **individual** (KIN-750: el organizador lo creó en la web con «Evento individual», sin serie). Son eventos completos (sorteo, rondas, cupo, categorías) y llegan a la app igual que los demás; en la app entran a la bandeja de eventos sueltos. Solo viajan datos públicos de la serie; la plantilla y las instrucciones de pago no salen.
- No hay un endpoint aparte de series: se descubren por sus eventos (una serie sin eventos publicados no le sirve a la app).
- Renombrar una serie o cambiar sus fechas NO cambia el `updated_at` de sus eventos, así que no aparece en una descarga con `since`; la app lo
  recoge en su descarga completa periódica (sin `since`).
- La app crea la serie local con `series.id` como vínculo estable (`series.remote_id`) y mete ahí a los eventos nuevos de esa serie sin pasar por la bandeja.

`events.registration_opens_at` (apertura programada de inscripciones) tampoco viaja en el contrato: solo afecta a quién puede inscribirse desde la web.
El organizador sigue pudiendo inscribir a mano antes de la apertura.

## Arena del evento (KIN-751)

Cambio **aditivo** del contrato 1 (una app anterior ignora el campo): cada evento de `GET /api/app/eventos` trae `arena`, la arena del catálogo del organizador a la que está enlazado:

```json
"arena": { "id": "<uuid>", "name": "Lienzo Charro del Norte", "city": "Monterrey" }
```

- `arena` es `null` cuando el evento no está enlazado a ninguna arena (la arena se borró, o el evento es anterior al catálogo y aún no se enlazó). La app debe tratar `null` o ausente como evento heredado y seguir usando `venue` y `city`.
- `venue` y `city` **no cambian**: siguen viajando como texto. Si hay `arena`, `venue` es el nombre de la arena y `city` su ciudad (la web los mantiene iguales; renombrar una arena actualiza los eventos que aún no se finalizan).
- El `id` es de la web y es estable: la app lo guarda como `remote_id` de la arena y agrupa por él, no por el texto. Una persona organizadora puede fusionar dos arenas en la web; los eventos pasan a la arena que queda y el `id` anterior deja de aparecer.
- Solo viajan id, nombre y ciudad; las notas internas de la arena no salen. No hay un endpoint de arenas aparte: se descubren por sus eventos.
- Renombrar una arena actualiza `venue`/`city` de sus eventos no finalizados (y su `updated_at`), así que llega en una descarga con `since`; los finalizados conservan el texto con que se jugaron y su `arena` se recoge en la descarga completa periódica (sin `since`).
