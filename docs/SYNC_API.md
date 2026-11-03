# API de sincronización con la app local

La app (Tauri) descarga eventos y participantes del organizador cuando hay internet y los guarda en su
SQLite local. Sin internet la app sigue funcionando con lo ya descargado.

Autenticación: `Authorization: Bearer <código>`. El organizador genera el código en su panel (pestaña *App local*); se muestra una sola vez y el servidor guarda solo su hash. Generar uno nuevo revoca el anterior. Para pruebas locales también sirve el valor fijo de `APP_SYNC_TOKEN`.

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

## Lado de la app (pendiente)
- Guardar `events.remote_id` y `ropers.global_id` (columnas **nullable**, migración aditiva según
  `roping-manager-tauri/src-tauri/migrations/MIGRATIONS.md`) para que reimportar actualice y no duplique.
- Coincidir participantes por `global_id`; si no existe, por celular normalizado (E.164) pidiendo confirmación.
- Pantalla de Ajustes → Cuenta web (token) y botón Sincronizar.

## Modalidades
Los ids de modalidad son `lazo` y `barriles` (los mismos en `events.disciplines`, `event_results.discipline` y `ratings`).
La app debe mapear cada modo de juego local a su id; los modos que la web aún no activa se ignoran.
