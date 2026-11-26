# Arenas en el panel del organizador: auditoría y contrato (KIN-762)

Para quien arma el panel (H03, KIN-763) y los pagos por arena (H05, KIN-765). Parte de lo entregado en KIN-751 (catálogo de arenas) y agrega el filtro por
arena del resumen del organizador. **No cambia nada de lo que viaja a la app** (ver `docs/SYNC_API.md`, «Arena del evento»).

## 1. Auditoría de H02

| Requerimiento | Estado | Dónde |
|---|---|---|
| Un organizador tiene una o varias arenas (catálogo propio) | Ya existe (KIN-751) | tabla `arenas`, única por organizador y `key` (`0052_arenas.sql`) |
| Ver, crear, editar y borrar sus arenas | Ya existe | `src/app/[lang]/organizador/arenas/**`, `src/lib/data/arenas.ts`, `arena-actions.ts` |
| Unir dos arenas sin perder eventos | Ya existe | función `public.merge_arenas(p_keep, p_drop)`; probado en `permisos.mjs` |
| Relacionar el evento y la plantilla de la serie con una arena | Ya existe | `events.arena_id` y `event_series_template.arena_id`; el trigger `events_sync_arena` enlaza (o crea) la arena cuando solo llega el texto del lugar |
| Elegir arena al crear o editar un evento | Ya existe | `ArenaFields.tsx`; `arenaId` en `src/lib/data/events.ts` |
| Historial de eventos y series por arena | Ya existe | `getArena()` en `src/lib/data/arenas.ts` |
| Filtro por arena en la lista de «Mis eventos» | Ya existe | `?arena=<llave>` en `organizador/page.tsx` (`parseArenaParam`) |
| La arena viaja a la app | Ya existe | campo `arena` de `GET /api/app/eventos`; sin cambios |
| Cada organizador solo ve y cambia las suyas (RLS) | Ya existe y se reforzó | `permisos.mjs`, bloques «Arenas del organizador» y «Resumen del organizador por arena» |
| **El resumen del panel se puede filtrar por arena** | **Se ajustó (esta historia)** | migración `0054_resumen_por_arena.sql`: `organizer_overview(p_arena)` |
| **Contrato escrito para el panel** | **Se agregó (esta historia)** | este documento y el tipo `Overview` en `src/lib/data/overview.ts` |
| Eventos y series anteriores conservan su arena y su lugar | Se verifica | la 0054 solo cambia una función de lectura; no toca tablas ni datos |
| UI del filtro en el panel | No aplica | es de H03 (KIN-763) |
| Cambios al formato que viaja a la app | No aplica | fuera de alcance |

## 2. Contrato del resumen por arena

```sql
public.organizer_overview(p_arena text default null) returns jsonb
```

- Se llama con la sesión del organizador (RPC de PostgREST: `rpc("organizer_overview", { p_arena })`). Anónimo y participantes reciben error `42501`.
  Sin sesión de organizador activo no hay resumen (igual que antes de la 0054).
- **Sin `p_arena` (o `null`, `""`, o un texto sin letras ni números)**: devuelve lo mismo que antes de la 0054 sobre todos los eventos del organizador.
  Una web anterior que llama `organizer_overview()` sin argumentos sigue funcionando.
- **Con `p_arena`**: es la **llave** de la arena, la misma que va en `?arena=<llave>` (`src/lib/arena.ts`, `arenaKey`). La base la calcula igual, así que
  también sirve el nombre escrito de cualquier forma («Arena X», «arena  x.»). Todo el resumen sale solo de los eventos de esa arena:
  próximo evento, estados, pagos, actividad reciente, pendientes y la próxima serie (la próxima serie que tenga al menos un evento ahí).
- **Una llave que no es de una arena suya, que no existe o que se renombró** no da error ni revela nada: el resumen sale vacío y `arena` es `null`.
  Quien llama puede distinguirlo de «sin filtro» porque mandó una llave y `arena` volvió `null`.
- **Renombrar una arena cambia su llave** (sale del nombre). Un enlace guardado con la llave vieja deja de coincidir; la lista de arenas siempre trae la
  llave actual.

### Forma de la respuesta

Igual que el resumen de siempre (`Overview` en `src/lib/data/overview.ts`) más un campo:

```jsonc
{
  "arena": { "id": "<uuid>", "name": "Lienzo Charro del Norte", "city": "Monterrey", "key": "lienzo charro del norte" },   // null sin filtro
  "series": { ... } | null,
  "next_event": { ... } | null,
  "payments": { "pending": 1, "paid": 1, "pending_cents": 30000, "collected_cents": 50000 },
  "states": { "open": 1, "scheduled": 0, "finished": 0, "draft": 1 },
  "activity": [ ... ],
  "todo": { "unpaid": [ ... ], "no_results": [ ... ], "no_opening": [ ... ] }
}
```

### Desde el código de la web

```ts
import { getOrganizerOverview } from "@/lib/data/overview";
import { parseArenaParam } from "@/lib/arena";

const overview = await getOrganizerOverview(parseArenaParam(sp.arena)); // "" = todas las arenas
```

## 3. Eventos del organizador con su arena

No hace falta una función nueva: cada evento ya trae su arena.

- **TypeScript**: `Event.arenaId` (`src/lib/data/events.ts`, columna `events.arena_id`); el catálogo con id, nombre, ciudad y llave sale de `arenas`
  (`listArenas()` en `src/lib/data/arenas.ts`).
- **SQL** (con la sesión del organizador, las reglas de la base solo devuelven lo suyo):

```sql
select e.id, e.slug, e.name, e.event_date, e.status, a.id as arena_id, a.name as arena, a.key as arena_key
from events e left join arenas a on a.id = e.arena_id
where e.organizer_id = auth.uid()
order by e.event_date;
```

`arena_id` es `null` en un evento sin lugar escrito. `events.venue` y `events.city` siguen siendo el nombre y la ciudad de la arena.

## 4. Permisos y pruebas

- `arenas`: cada organizador solo ve, crea, edita y borra las suyas (RLS); un participante y el anónimo no ven ninguna.
- `organizer_overview`: la llave se busca solo entre las arenas de quien llama; otra persona que mande esa llave recibe el resumen vacío.
- Cubierto en `supabase/tests/permisos.mjs` (`npm run test:db`), bloque «Resumen del organizador por arena»: dos arenas con eventos, pagos y una serie;
  el filtro; la llave escrita de otra forma; llave ajena, inexistente y renombrada; y que sin filtro todo siga igual.
