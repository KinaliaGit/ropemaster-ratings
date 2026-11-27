# Ciclo de vida y visibilidad de los eventos (KIN-769)

Contrato para el panel del organizador (H03), la vista pública (H04, H08), la integración con la App (H13) y las invitaciones (KIN-753).
Decidido con Edgar el 2026-11-26. Migración `0057_visibilidad_de_los_eventos.sql`. **Entrega A**: el modelo y la regla, más elegir la visibilidad al publicar (migración `0058`). Cambiarla después y las
invitaciones son de KIN-753.

## Modelo: dos propiedades distintas

| Propiedad | Valores | Qué es |
|---|---|---|
| `events.status` (ciclo de vida) | `borrador`, `publicado`, `finalizado` | **No cambió.** En qué etapa está el evento |
| `events.visibility` (visibilidad) | `publico` (por defecto), `privado` | **Nueva.** Quién puede ver un evento ya publicado |

Todos los eventos que ya existían quedaron `publico`: no cambia nada para ellos. Tipos y valores para código nuevo: `src/lib/event-visibility.ts`.

## Quién ve qué

Un **borrador** solo lo ve su organizador (público o privado). La visibilidad solo importa cuando el evento está publicado o finalizado.

| Quién | Borrador | Público (publicado o finalizado) | Privado (publicado o finalizado) |
|---|---|---|---|
| Su organizador | Sí | Sí | Sí |
| Persona inscrita o en la lista de espera de ese evento | No | Sí | **Sí** |
| Cualquier otra persona con sesión (otro participante u organizador) | No | Sí | **No** |
| Sin sesión | No | Sí | **No** |

Para quien no puede ver un evento privado, el evento **no existe**: no sale en listados, búsquedas, filtros ni por su dirección, y la base no distingue «no existe» de
«es privado» (así no se revela que existe). Los resultados, las categorías, las fotos, la serie, los conteos y las listas de inscritos siguen al evento: se ven si el
evento se ve.

## Fases y finalización automática

- **Transiciones válidas del estado** (lo que hoy permiten la web y la App; `canTransition` en `event-visibility.ts`):
  - `borrador` <-> `publicado`: el organizador, desde la web. Para publicar se exige ciudad, lugar, cupo y al menos una categoría (`event-publish.ts`).
  - `publicado` -> `finalizado`: al cerrar los resultados desde la App, o **por fecha** (abajo).
  - `finalizado` -> nada: reabrir los resultados desde la App no cambia el estado.
- **Condición de finalización automática (decidida, sin supuestos):** un evento `publicado` cuya **fecha ya pasó, en su propia zona horaria**, cuenta como `finalizado` aunque
  nadie lo cierre. El evento tiene solo fecha (sin hora): el mismo día todavía no ha pasado. Un borrador nunca se finaliza solo.
- **Se calcula al leer, sin tarea programada**, para que nunca quede desfasado. La base sigue diciendo `publicado` hasta que se cierran los resultados. Es **una sola
  regla en dos lugares que dan lo mismo**: `public.event_phase(status, event_date, timezone)` en SQL y `statusByDate` en `src/lib/event-time.ts`. Una prueba compara las
  dos en 72 combinaciones de estado, fecha y zona horaria (`npm run test:db`).

## Dónde se aplica la regla

Un solo lugar: **`public.can_view_event(organizer_id, status, visibility, event_id)`**. Vive en `public` porque las políticas de lectura pública la llaman y quien no tiene
sesión no puede entrar al esquema `private`. Solo contesta sí o no para quien pregunta. Para sumar las invitaciones (KIN-753) se amplía aquí, en un solo lugar.

| Dónde | Cómo |
|---|---|
| Políticas de lectura de `events` | Un evento público se decide con la columna (rápido); la función solo se llama para los privados |
| `event_categories`, `event_photos` | Se ven si el evento se ve (consultan `events`, que ya pasa por la política). Resultados y series ya funcionaban así |
| Funciones públicas `event_enrolled`, `event_registrants`, `event_registrants_page`, `event_registration_counts`, `event_waitlist_counts` | Saltan RLS, así que ahora filtran por la misma regla |
| Inscripciones y lista de espera (`registrations`, `event_waitlist`) | Guarda en la tabla: quien tiene sesión solo puede insertar en un evento que puede ver. Sirve para `register_for_event`, `join_waitlist` y todas sus variantes. Sin sesión (el servidor y la App) no aplica |

Efecto hoy: **nadie puede inscribirse a un evento privado** salvo su organizador (que inscribe a mano). Primero hace falta la invitación (KIN-753).

## Quién puede cambiar la visibilidad

**Se elige una sola vez, al publicar el evento recién creado.** En el formulario de crear evento, «Publicar» abre una ventana que pregunta «Público» o «Privado»; el servidor
(`createEvent`, `visibilityForCreate`) guarda estado y visibilidad en el mismo insert. Migración `0058_visibilidad_al_crear.sql`: `authenticated` tiene permiso de **INSERT**
sobre `visibility`, pero **no de UPDATE**. Por eso:

- Un borrador siempre nace `publico` (la visibilidad solo se lee al publicar).
- Después de creado, la web no la cambia (ni a privado ni de vuelta a público); solo el servidor y el administrador de la base. Cambiarla después es de KIN-753.
- Los otros caminos de publicar (serie «crear y publicar», interruptor de publicar del administrador) no preguntan: el evento queda `publico`.
- Un privado recién creado muestra un aviso distinto en su panel: no sale en el listado, el enlace solo lo abre quien ya está inscrito, y por ahora las personas las inscribe el organizador.

## Contrato para quien consume

- **Valores:** `status` y `visibility` como arriba. Leer `visibility` de la base y pasarlo por `parseVisibility`: lo desconocido es `publico`.
- **Fase para mostrar:** usar `statusByDate` (web) o `public.event_phase` (SQL); no repetir la condición de la fecha. (El resumen del organizador, `organizer_overview`, todavía
  la repite en SQL; una prueba comprueba que da lo mismo.)
- **La App** recibe los eventos publicados y finalizados de su organizador, incluidos los privados (son suyos). El campo `visibility` en `GET /api/app/eventos` y su
  documentación en `SYNC_API.md` se agregan con KIN-753 («la privacidad llega a la app»); esta entrega no cambia el contrato con la App.
- **No leer `visibility` en consultas de la web antes de aplicar la 0057** en la base: la columna no existiría y la consulta fallaría.

## Pendiente (no es de esta entrega)

- **KIN-753** (Neaves): interfaz para marcar un evento como privado, lista de correos invitados, correo de invitación, estado de cada invitación y el campo en el contrato con la
  App. **La decisión del enlace** (iniciar sesión y que el correo esté invitado, o un enlace de un solo uso: KIN-735) la toma Neaves; la regla de acceso de aquí no depende de eso.
- **Archivos de las fotos:** las políticas de las filas de `event_photos` ya siguen al evento, pero los archivos del bucket público se sirven por su dirección. Si hace falta que
  un privado no tenga fotos accesibles por dirección, hay que cambiar el bucket a privado (decisión aparte).
- **Sitemap y SEO** (KIN-617, PR cerrado sin mergear): si se retoma, no debe listar eventos privados.

## Pruebas

`npm run test:db`, bloque «Estado y visibilidad de los eventos»: cada estado y visibilidad contra cada tipo de persona (sin sesión, otro organizador, otro participante, inscrito, en lista
de espera y dueño) en eventos, categorías, fotos y resultados; las cinco funciones públicas; la guarda de escritura (con sesión, sin sesión, por función y directa); que la
visibilidad solo se escriba al crear (no se actualiza desde la web, no se crea a nombre de otro organizador) y que solo acepte `publico` o `privado`; y `event_phase` contra `statusByDate`. Unitarias: `tests/event-visibility.test.mjs`.
