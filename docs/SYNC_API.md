# API de sincronización con la app local

La app (Tauri) descarga eventos y participantes del organizador cuando hay internet y los guarda en su
SQLite local. Sin internet la app sigue funcionando con lo ya descargado.

Autenticación: `Authorization: Bearer <código>`. El organizador genera el código en su panel (pestaña *App local*); se muestra una sola vez y la base (`api_tokens`) guarda solo su hash sha256. Generar uno nuevo revoca el anterior, y también se puede revocar sin generar otro. Un código revocado deja de funcionar al instante, y reiniciar el servidor no desconecta a la app. El panel muestra cuándo se creó y cuándo se usó por última vez.

- `401`: código inválido o revocado (no reintentar; la app pide reconectar).
- `429`: demasiados intentos con un código inválido desde la misma IP (20 en 5 minutos). Trae `Retry-After`.
- `503`: falla temporal al verificar el código. Sí reintentar.

Configuración del servidor: `SUPABASE_SERVICE_ROLE_KEY` (secreta, solo servidor) es obligatoria en producción. Sin ella, fuera de producción los códigos viven en memoria y se pierden al reiniciar; en producción la API responde `503`. El valor fijo `APP_SYNC_TOKEN` solo funciona fuera de producción, para pruebas locales.

## `GET /api/app/eventos?since=<ISO-8601>`
Eventos del organizador con estado `publicado` o `finalizado` (los borradores no se envían), con sus inscritos.
`since` es opcional: devuelve solo lo modificado después de esa fecha. Guarda el `generated_at`/máximo
`updated_at` recibido para la siguiente llamada.

```json
{ "organizer": "Rodeo Norte", "events": [{
  "id": "…", "name": "…", "date": "2026-12-06", "city": "…", "venue": "…", "status": "publicado",
  "disciplines": ["Lazo"], "capacity": 100, "description": "…", "updated_at": "2026-11-01T18:30:00Z",
  "categories": [{ "name": "Libre", "fee_cents": 80000 }],
  "registrations": [{ "roper_global_id": "…", "name": "…", "payment_status": "pagado" }]
}] }
```

## `GET /api/app/participantes`
Directorio global. `ratings` trae un rating (escala de 1 a 10, un decimal) POR modalidad (`lazo`, `barriles`, …); una modalidad sin entrada significa que el participante nunca ha competido en ella. Hoy solo `lazo` está activo. Incluye `phone` (llave de coincidencia) porque solo lo reciben organizadores autenticados.

```json
{ "participants": [{ "global_id": "…", "name": "…", "phone": "+52…", "phone_verified": true,
                     "ratings": { "lazo": { "rating": 9.4, "events": 18, "wins": 6 } } }] }
```

## Subida de resultados (contrato v1, BORRADOR para aprobar)

Estado: propuesta pendiente de revisión por Ana (rating) y Edgar (app). Los ejemplos JSON completos están en
[`docs/sync-examples/`](sync-examples/) y ambos lados los usan como datos de prueba.

### Versión del contrato
- El cuerpo de cada petición lleva `contract_version` (entero) y la respuesta lo repite. Hoy es `1`.
- Cambios compatibles (campos nuevos opcionales) NO suben la versión: quien lee ignora lo que no conoce.
- Si la app manda una versión que el servidor ya no acepta, o el servidor responde una versión mayor que la que la app entiende:
  respuesta `426 Upgrade Required` (código `version_unsupported`). La app deja de sincronizar, conserva su cola intacta y
  muestra "actualiza la app". No descarta nada.

### `POST /api/app/resultados`
Sube un lote de resultados. Misma autenticación `Authorization: Bearer <código>`.

Campos del cuerpo: `contract_version`, `client_batch_id` (UUID del envío, solo para bitácora) y `results[]`.

| Campo del resultado | Tipo | Regla |
|---|---|---|
| `id` | UUID | Lo genera la app y no cambia nunca. Es la llave de idempotencia |
| `revision` | entero >= 1 | La app lo sube en 1 cada vez que corrige ese resultado |
| `event_id` | UUID | Id del evento en la web (el mismo `id` que recibió en `GET /api/app/eventos`) |
| `roper_global_id` | UUID | `global_id` del participante en el directorio |
| `discipline` | texto | `lazo` o `barriles`. Solo las modalidades activas en la web |
| `time_ms` | entero o `null` | >= 0. `null` si no hubo tiempo (descalificado o sin tiempo) |
| `penalty_ms` | entero | >= 0. Ya viene separado: el tiempo final es `time_ms + penalty_ms` |
| `disqualified` | booleano | Si es `true`, `place` debe ser `null` |
| `place` | entero o `null` | Lugar >= 1 dentro de esa modalidad y evento, o `null` si no puntúa |
| `recorded_at` | fecha ISO-8601 | Cuándo se capturó en la app. Informativo |

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
| `invalid_field` | Un campo no cumple las reglas de la tabla | no |
| `event_not_found` | El `event_id` no existe | no |
| `event_forbidden` | El evento no es de este organizador | no |
| `event_closed` | El evento está `finalizado` (ver abajo) | no, hasta reabrir |
| `roper_unknown` | El `roper_global_id` no existe en el directorio | no |
| `discipline_inactive` | La modalidad no está activa en la web | no |
| `stale_revision` | Llegó una `revision` menor o igual con datos distintos a los guardados | no |
| `temporary_error` | Falla interna al guardar ese resultado | sí |

### Códigos HTTP del lote

| HTTP | Cuándo | ¿Reintentar? |
|---|---|---|
| `200` | Lote procesado (revisar el estado de cada resultado) | no hace falta |
| `400` | Cuerpo mal formado o campos obligatorios ausentes | no, es un error de la app |
| `401` | Código de conexión inválido o revocado | no. La app pide reconectar en Ajustes → Cuenta web |
| `403` | Organizador no verificado | no, hasta que lo verifiquen |
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

### Cerrar un evento: `POST /api/app/eventos/<event_id>/cierre`
El evento pasa a `finalizado`. **El recálculo de ratings NO es parte de este contrato**: está en pausa hasta definir la solución
(KIN-571). Cerrar solo cambia el estado; cuando exista el cálculo, se enganchará aquí sin cambiar la forma de la petición. Cuerpo: `{ "contract_version": 1, "expected_results": <n> }`.

- `expected_results` es el total de resultados que la app tiene para ese evento. Si el servidor tiene otra cantidad:
  `409` con `code: "incomplete"` y `results_count`. La app reenvía lo que falte y vuelve a cerrar. Así un cierre nunca deja
  resultados a medias.
- Cerrar un evento ya finalizado responde `200` con `already_closed: true` (es idempotente).
- La respuesta no trae ratings. Los ratings siguen saliendo de `GET /api/app/participantes` con los valores que tenga la web.
- Solo el organizador dueño del evento (`403` si no).

### Corregir un evento ya finalizado: `POST /api/app/eventos/<event_id>/reabrir`
Cuerpo: `{ "contract_version": 1, "reason": "texto" }` (el motivo es obligatorio y queda en bitácora). El evento vuelve a
`publicado`, la app reenvía los resultados corregidos (con `revision` mayor) y vuelve a cerrar.

### Pruebas
Los archivos de `docs/sync-examples/` forman los casos base. Web y app deben poder reproducirlos tal cual:

| Caso | Archivos |
|---|---|
| Lote con 1 aceptado, 1 repetido y 1 rechazado | `resultados.request.json` / `resultados.response.json` |
| Corrección con `revision` 2 | `resultados.correccion.request.json` / `resultados.correccion.response.json` |
| Cierre del evento | `cierre.request.json` / `cierre.response.json` |

### Cómo encaja con la app y con la web (revisado contra el código)
Revisado contra el esquema de la web (`supabase/migrations`) y el de la app (`roping-manager-tauri/src-tauri/migrations`).

**Lo que ya cuadra**
- `event_results` ya existe en la web con `id` UUID, `event_id`, `roper_id`, `discipline`, `time_ms`, `penalty_ms`, `disqualified`.
- La app ya tiene UUID estable para eventos (`event.uuid`, migración 0023) y para lazadores (`roper.public_id`).
- `events.status` ya acepta `finalizado`, y reabrir (volver a `publicado`) no necesita cambios.

**Lo que falta o hay que ajustar**
1. **La web no tiene los endpoints.** `POST /api/app/resultados`, `/cierre` y `/reabrir` no existen. Las rutas actuales de
   `/api/app` leen datos de ejemplo (`src/lib/mock.ts`), no de la base.
2. **Columnas nuevas en `event_results`:** `revision`, `place` y `recorded_at` (aditivas). Hoy no existen.
3. **La app captura por EQUIPO, no por lazador.** Una corrida (`run`) es de un equipo (cabecero + pialador), no de una persona. El
   contrato es por lazador, así que cada corrida genera dos resultados, uno por integrante. La app necesita un UUID estable por
   (corrida, rol) para usarlo como `id`; la tabla `run` hoy solo tiene `id` entero local.
4. **Unidades:** la app guarda segundos con decimales (`time_sec`, `penalty`, `official_time_sec`, `REAL`). El contrato usa
   milisegundos enteros, así que la app redondea al convertir.
5. **Estados de la app:** `result_status` tiene `qualified`, `no_time`, `disqualified`, `rerun`, `dns`, `scratched`, `skipped`. El
   contrato solo distingue `disqualified` y tiempo `null`. Propuesta para v1: `qualified` envía tiempo; `no_time` envía
   `time_ms: null`; `disqualified` envía `disqualified: true`; `dns`, `scratched`, `skipped`, `rerun` y `pending` no se envían.
6. **Sustituciones:** si un sustituto corre en lugar de un integrante, el resultado debe ir al lazador que corrió, o al original
   según cuente la corrida (migraciones 0033 y 0055 de la app). Hay que acordar cuál.
7. **Vínculo de ids:** la app necesita guardar el id de la web de cada evento y lazador (`remote_id`, `global_id`). Es KIN-589.

### Preguntas abiertas (a resolver al aprobar)
1. **Participantes que solo existen en la app.** Un resultado exige `roper_global_id`. Si el participante es nuevo y aún no está en el
   directorio, hoy se rechaza con `roper_unknown`. Falta decidir cómo se da de alta (ligado a KIN-592 y a la decisión de que el
   celular ya no es la llave de identidad ni se verifica).
2. **Fórmula del rating** (KIN-571): el recálculo está en pausa y no es parte de este contrato. Si la fórmula necesita datos que no
   están aquí (por ejemplo número de participantes por ronda), habrá que añadirlos de forma compatible.
3. **Límites** de 200 resultados y 256 KB: razonables para un evento típico, confirmar con un evento grande real.
4. **Autenticación:** este contrato asume el código de conexión por organizador (KIN-584). El valor fijo `APP_SYNC_TOKEN` solo
   debe existir en desarrollo.

## Lado de la app (pendiente)
- Guardar `events.remote_id` y `ropers.global_id` (columnas **nullable**, migración aditiva según
  `roping-manager-tauri/src-tauri/migrations/MIGRATIONS.md`) para que reimportar actualice y no duplique.
- Coincidir participantes por `global_id`; si no existe, por celular normalizado (E.164) pidiendo confirmación.
- Pantalla de Ajustes → Cuenta web (token) y botón Sincronizar.

## Modalidades
Los ids de modalidad son `lazo` y `barriles` (los mismos en `events.disciplines`, `event_results.discipline` y `ratings`).
La app debe mapear cada modo de juego local a su id; los modos que la web aún no activa se ignoran.
