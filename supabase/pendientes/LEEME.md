# Pendientes de base de datos (no son migraciones todavía)

`limpieza_y_indices.sql`: une reglas de lectura duplicadas (2 avisos de rendimiento del revisor de Supabase) y agrega índices.
No es urgente con las tablas vacías. Cuando haya datos reales: moverlo a `supabase/migrations/` con el siguiente número y aplicarlo.
