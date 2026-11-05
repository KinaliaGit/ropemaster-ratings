// Límites de subida de fotos. Un solo lugar para que formulario, avisos y validaciones del servidor no se desfasen.

// Archivo ORIGINAL que elige la persona (se rechaza con aviso visible).
export const MAX_UPLOAD_MB = 5;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Imagen YA reducida que llega al servidor (los buckets de Supabase tienen su propio tope, migración 0011).
export const MAX_AVATAR_BYTES = 250 * 1024; // 256 px, JPEG: normalmente decenas de KB
export const MAX_EVENT_PHOTO_BYTES = 1500 * 1024; // lado largo 1600 px, JPEG
export const AVATAR_SIDE = 256;
export const EVENT_PHOTO_SIDE = 1600;
export const MAX_EVENT_PHOTOS = 20;
