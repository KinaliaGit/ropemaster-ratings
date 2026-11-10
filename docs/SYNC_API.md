# API de sincronización con la app local

La app (Tauri) descarga eventos y participantes del organizador cuando hay internet y los guarda en su
SQLite local. Sin internet la app sigue funcionando con lo ya descargado.

Autenticación: `Authorization: Bearer <código>`. El organizador genera el código en su panel (pestaña *App local*); se muestra una sola vez y la base (`api_tokens`) guarda solo su hash sha256. Generar uno nuevo revoca el anterior, y también se puede revocar sin generar otro. Un código revocado deja de funcionar al instante, y reiniciar el servidor no desconecta a la app. El panel muestra cuándo se creó y cuándo se usó por última vez.

Cada equipo tiene su propio token (hasta 3 por organizador; el código manual es aparte, uno solo, y no cuenta dentro de los 3). Generar el código manual nuevo revoca solo el manual anterior, no a los equipos. **Todo token vence a los 30 días sin usarse**; cada uso exitoso reinicia el plazo, y sin internet no vence por reloj de la app: lo decide la web cuando la app vuelve a conectarse. Un token vencido responde `401` igual que uno revocado, y la app pide reconectar sin tocar sus datos locales.

- `401` (`code: "invalid_token"`): código inválido, revocado o vencido por 30 días sin uso (no reintentar; la app pide reconectar).
- `429` (`code: "rate_limited"`): demasiados intentos con un código inválido desde la misma IP (20 en 5 minutos). Trae `Retry-After`.
- `503` (`code: "service_unavailable"`): falla temporal al verificar el código. Sí reintentar.

Configuración del servidor: `SUPABASE_SERVICE_ROLE_KEY` (secreta, solo servidor) es obligatoria en producción. Sin ella, fuera de producción los códigos viven en memoria y se pierden al reiniciar; en producción la API responde `503`. El valor fijo `APP_SYNC_TOKEN` solo funciona fuera de producción, para pruebas locales.

## `POST /api/app/login`
La app entra con el correo y la contraseña de la cuenta de organizador de la web (los mismos del sitio). La web comprueba la contraseña con
Supabase Auth, **no abre una sesión de navegador** y entrega un token propio para ese equipo. Ese token se usa como `Authorization: Bearer <token>`
en todos los demás endpoints, igual que el código manual. La app lo guarda en el llavero del sistema (nunca la contraseña) y sin internet sigue
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
| `409` | `device_limit` | Ya hay 3 equipos conectados. **No cierra ninguno**: el organizador revoca uno en su panel (*App local*) | no, pide revocar uno |
| `413` | `payload_too_large` | Cuerpo de más de 4 KB | no |
| `426` | `version_unsupported` | La web ya no habla esa versión del contrato | no, pide actualizar |
| `429` | `rate_limited` | Demasiados intentos fallidos (20 por IP o 10 por correo en 5 minutos; solo cuentan los fallos). Trae `Retry-After` | sí, tras la espera |
| `503` | `service_unavailable` | Falla temporal de la web o de Supabase | sí |

## `POST /api/app/logout`
`Authorization: Bearer <token>`. Revoca **solo** el token con el que se llama (ese equipo). Siempre responde `200 { "ok": true, "revoked": <boolean> }`:
un token que ya estaba revocado, vencido o que no existe da `revoked: false`, así la app puede olvidar su token local sin distinguir. Sin internet la app
solo lo olvida; la web lo deja vencer a los 30 días sin uso o el organizador lo revoca en su panel. Sin encabezado `Authorization`: `401 invalid_token`.

## `GET /api/app/eventos?since=<ISO-8601>&cursor=<texto>`

Estado: implementada (KIN-585). Ejemplo completo y versionado: [`docs/sync-examples/eventos.response.json`](sync-examples/eventos.response.json); la web lo comprueba en sus pruebas y la app puede usarlo tal cual como dato de prueba.

Eventos del organizador del código con estado `publicado` o `finalizado` (los borradores nunca se envían), cada uno con sus categorías y sus
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
  "disciplines": ["lazo"], "capacity": 100, "description": "…", "updated_at": "2026-11-05T18:30:00.000Z",
  "categories": [{ "id": "…", "name": "Libre", "fee_cents": 80000 }],
  "registrations": [{ "id": "…", "roper_global_id": "…", "name": "…", "category_id": "…", "category": "Libre",
                      "payment_status": "pagado", "amount_cents": 80000, "payment_method": "efectivo" }]
}], "next_cursor": null, "generated_at": "2026-11-06T09:00:00.000Z" }
```

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | Id del evento en la web (el mismo `event_id` que se usa al subir resultados). |
| `slug` | texto | Parte de la dirección pública del evento. |
| `date` | `AAAA-MM-DD` o `""` | Sin hora. |
| `status` | `publicado` \| `finalizado` | |
| `disciplines` | lista de ids de modalidad | `lazo`, `barriles` (ver *Modalidades*). |
| `capacity` | entero o `null` | `null` = sin límite. |
| `updated_at` | fecha ISO-8601 UTC | Último cambio del evento, sus inscripciones o sus categorías. |
| `categories[].fee_cents` | entero >= 0 | Montos SIEMPRE en centavos. |
| `registrations[].id` | UUID | Id de la inscripción. Una persona puede tener una por categoría. |
| `registrations[].roper_global_id` | UUID | `global_id` del participante (el mismo de `GET /api/app/participantes`). Si su perfil se fusionó con otro, es el del perfil vigente. |
| `registrations[].category_id` / `category` | UUID / texto, o `null` | Categoría elegida. |
| `registrations[].payment_status` | `pendiente` \| `pagado` \| `reembolsado` | Una inscripción `pendiente` también ocupa lugar. |
| `registrations[].amount_cents` | entero >= 0 | Lo que se cobró por esa inscripción, en centavos. |
| `registrations[].payment_method` | `efectivo` \| `transferencia` \| `stripe` o `null` | `null` mientras esté pendiente. |

Las inscripciones NO llevan correo ni celular: para eso está `GET /api/app/participantes` (que sí exige organizador activo y evento propio).

Errores (todos con `{ "code": "…", "error": "texto para personas" }`; la app decide con `code` y el HTTP, no con el texto):

| HTTP | `code` | Cuándo | ¿Reintentar? |
|---|---|---|---|
| `400` | `invalid_field` | `since`, `cursor` o `X-Contract-Version` mal formados | no, es un error de la app |
| `401` | `invalid_token` | código inválido o revocado | no. La app pide reconectar en Ajustes → Cuenta web |
| `403` | `organizer_not_active` | el organizador no tiene licencia vigente ni aprobación manual | no, hasta que lo activen |
| `426` | `version_unsupported` | la web ya no acepta esa versión del contrato | no, hay que actualizar la app |
| `429` | `rate_limited` | demasiados intentos con un código inválido. Trae `Retry-After` (segundos) | sí, esperando `Retry-After` |
| `503` | `service_unavailable` | falla temporal de la web o de la base | sí, con espera creciente |

Orden de las comprobaciones: código de conexión (`401`/`429`/`503`), versión y parámetros (`400`/`426`), organizador activo (`403`).

## `GET /api/app/participantes?event_id=<uuid>&since=<ISO-8601>&cursor=<texto>`

**La sincronización de participantes es SIEMPRE por evento (decisión del 2026-11-05).** No existe un modo "todo el
directorio": devuelve solo a las personas inscritas en UN evento del organizador del código de conexión. Con decenas de
miles de lazadores, bajar todo sería enorme y expondría correos de gente ajena a ese organizador. Reglas:

- `event_id` es **obligatorio** (el `id` del evento en la web, el mismo que entrega `GET /api/app/eventos`). Sin él, `400`.
- El evento debe ser del organizador del código. Si no existe o es de otro, `404` (sin revelar si existe).
- Solo organizadores **activos** (licencia vigente o aprobación manual). Si no lo es, `403` con un mensaje claro y sin correos.
- La identidad es el **correo** (único y en minúsculas). El celular ya no es llave ni se verifica, y no se envía.
- `since` y `cursor` son por evento: la app guarda un `since` distinto para cada uno. `generated_at` es el corte de la
  consulta; la app lo guarda como el próximo `since` solo si recibió todas las páginas.
- `ratings` trae un rating (escala de 1 a 10, un decimal) POR modalidad **activa** (hoy solo `lazo`). Quien aún no tiene rating en
  una modalidad viene con el rating inicial (1, igual que se muestra en la web), `events: 0`, `wins: 0` y `updated_at: null`. Las
  modalidades que la web no tiene activas no se envían.
- Cada participante lleva solo `global_id`, `name`, `email`, `claimed` y `ratings`. Nunca celular ni ids de cuenta.
- Un perfil fusionado (`merged_into`) no se incluye.

```json
{ "participants": [{ "global_id": "…", "name": "…", "email": "ana@example.com", "claimed": true,
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
| `401` | Código de conexión inválido o revocado | no, hay que reconectar |
| `403` | El organizador no está activo (sin licencia vigente ni aprobación) | no, hasta que lo apruebe un admin |
| `404` | El evento no existe o no es del organizador (no se distingue) | no |
| `429` | Demasiados intentos con un código inválido (trae `Retry-After`) | sí, después de esperar |
| `503` | Falla temporal | sí |

Las respuestas llevan `Cache-Control: no-store`. Los correos nunca se escriben en los registros del servidor.

Estado: implementada (KIN-586). La app la usa desde KIN-592 con este mismo formato.

## Subida de resultados (contrato v1)

Estado: **implementada en la web** (KIN-587): `POST /api/app/resultados`, `POST /api/app/eventos/<id>/cierre` y `POST /api/app/eventos/<id>/reabrir`.
La app la usará desde KIN-593. Los ejemplos JSON completos están en [`docs/sync-examples/`](sync-examples/); la web los usa como datos de
prueba (`npm run test:db` y `npm run test:unit`) y la app debe poder reproducirlos tal cual.

Decisiones (2026-11-06): un resultado de alguien **sin lazador en la web** se acepta igual, solo para el evento y sin ligarlo a nadie; un
evento **cerrado** no cambia hasta reabrirlo con un motivo, y reabrir se hace **desde la app**; reabrir **no** cambia el estado del evento.

### Versión del contrato
- El cuerpo de cada petición lleva `contract_version` (entero) y la respuesta lo repite. Hoy es `1`.
- Cambios compatibles (campos nuevos opcionales) NO suben la versión: quien lee ignora lo que no conoce.
- Si la app manda una versión que el servidor ya no acepta, o el servidor responde una versión mayor que la que la app entiende:
  respuesta `426 Upgrade Required` (código `version_unsupported`). La app deja de sincronizar, conserva su cola intacta y
  muestra "actualiza la app". No descarta nada.

### `POST /api/app/resultados`
Sube un lote de resultados. Misma autenticación `Authorization: Bearer <código>`.

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
| `rounds` | lista (máx. 20) | Las rondas que se intentaron (ver abajo). Opcional: sin ella solo queda el resumen |
| `recorded_at` | fecha ISO-8601 | Cuándo se capturó en la app. Informativo |

Cada elemento de `rounds`:

| Campo | Tipo | Regla |
|---|---|---|
| `round` | entero 1 a 20 | Número de ronda. Las `regular` no repiten número dentro de la misma `stage`; las `extra` y `help` sí pueden |
| `stage` | `preliminary`, `final` o `tiebreak` | Etapa. Si falta, `preliminary` (sirve para saber quién llegó a la final). `tiebreak` es una ronda de desempate |
| `kind` | `regular`, `extra` o `help` | Si falta, `regular`. `extra` es una corrida extra y `help` una ayuda de una vacante del sorteo |
| `status` | `completed`, `no_time` o `disqualified` | `completed` exige `time_ms`; los otros dos exigen `time_ms: null` |
| `time_ms` | entero o `null` | >= 0 |
| `penalty_ms` | entero | >= 0. Por defecto 0 |
| `substitution` | objeto, opcional | Quién corrió en sustitución en esa ronda (ver abajo). `null` equivale a no ponerlo |

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
| `401` | Código de conexión inválido o revocado | no. La app pide reconectar en Ajustes → Cuenta web |
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
4. **Autenticación:** este contrato asume el código de conexión por organizador (KIN-584). El valor fijo `APP_SYNC_TOKEN` solo
   debe existir en desarrollo.

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
