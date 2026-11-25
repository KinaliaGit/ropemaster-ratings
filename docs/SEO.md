# SEO de la web (KIN-617)

Qué hay en el código y qué falta hacer a mano en Google.

## En el código
- `src/lib/seo.ts`: dirección del sitio, canonical e idiomas (hreflang), vista previa al compartir (Open Graph y Twitter) y datos estructurados (JSON-LD).
- `src/app/robots.ts` y `src/app/sitemap.ts`: `/robots.txt` y `/sitemap.xml`. El mapa incluye portada, ranking, legales, cada evento público y cada serie con eventos públicos, en español e inglés. **No** incluye perfiles de lazadores (son datos de personas; decisión pendiente).
- Evento (`/eventos/[id]`): título, descripción, canonical, vista previa con el flyer y JSON-LD `SportsEvent` (fecha, lugar, organizador, serie, ofertas por categoría).
- Serie (`/series/[id]`): metadatos y JSON-LD `EventSeries`.
- Portada: JSON-LD `Organization` (Kinalia) y `WebSite`.
- Páginas privadas (organizador, cuenta, entrar, registro, recuperar, notificaciones, inscribirse): `noindex`. Se dejan rastreables a propósito para que Google lea el `noindex`.
- No hay `aggregateRating` ni reseñas: Google solo muestra estrellas con reseñas reales y visibles, y hoy no las hay.

## Variable obligatoria en producción
`NEXT_PUBLIC_SITE_URL` debe ser la dirección pública real (por ejemplo `https://ratings.kinalia.com.mx`), sin diagonal final. De ahí salen el canonical, el sitemap y los enlaces de los datos estructurados. Si falta, se usa `http://localhost:3000` y Google recibiría direcciones equivocadas.

## Pasos manuales en Google
1. Search Console: agregar la propiedad (de dominio, verificada por DNS).
2. Enviar `https://<sitio>/sitemap.xml` en Sitemaps.
3. Inspección de URLs: pedir indexación de la portada, `/es/participantes` y un evento publicado.
4. Rich Results Test (`https://search.google.com/test/rich-results`): pegar la URL de un evento publicado y confirmar que detecta "Eventos" sin errores.
5. Revisar en Search Console los reportes de Indexación y Mejoras a las 1 a 2 semanas.
