# API de sincronización con la app local

La app (Tauri) descarga eventos y participantes del organizador cuando hay internet y los guarda en su
SQLite local. Sin internet la app sigue funcionando con lo ya descargado.

Autenticación: `Authorization: Bearer <token>` (token que el organizador genera en *Conexión con la app*).

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
Directorio global con rating. Incluye `phone` (llave de coincidencia) porque solo lo reciben organizadores autenticados.

```json
{ "participants": [{ "global_id": "…", "name": "…", "phone": "+52…", "rating": 94,
                     "events": 18, "wins": 6, "phone_verified": true }] }
```

## Lado de la app (pendiente)
- Guardar `events.remote_id` y `ropers.global_id` (columnas **nullable**, migración aditiva según
  `roping-manager-tauri/src-tauri/migrations/MIGRATIONS.md`) para que reimportar actualice y no duplique.
- Coincidir participantes por `global_id`; si no existe, por celular normalizado (E.164) pidiendo confirmación.
- Pantalla de Ajustes → Cuenta web (token) y botón Sincronizar.
