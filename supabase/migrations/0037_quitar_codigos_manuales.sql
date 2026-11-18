-- Fuera los códigos de conexión manuales (KIN-631). La app ya solo entra con correo y contraseña (un token por equipo, KIN-606), así que
-- el código que se copiaba del panel y se pegaba a mano deja de existir. Solo se quita lo manual: los equipos y sus tokens no se tocan.
--  * Los códigos manuales que siguieran activos se revocan: dejan de servir al instante (verify_api_token ya ignora lo revocado).
--  * rotate_api_token (la única forma de crear uno) se elimina. La columna `kind` y las filas viejas se conservan como historial.
-- Se puede ejecutar más de una vez sin efecto extra.

update public.api_tokens set revoked_at = now() where kind = 'manual' and revoked_at is null;

drop function if exists public.rotate_api_token(uuid, text, text);
