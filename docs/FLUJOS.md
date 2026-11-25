# Mapa de flujos de pantalla (KIN-624)

Destino esperado de cada paso. Se usa como guía de la prueba de punta a punta (KIN-602, 603 y 604). Cada flujo se prueba con y sin sesión,
recargando, volviendo atrás y abriendo el enlace dos veces.

## Cuentas
| Paso | Destino esperado |
|---|---|
| Registro (`/registro`) con confirmación de correo activada | `/registro?check=email&email=…` («te mandamos un correo», con botón de reenviar) |
| Enlace del correo (`/auth/confirm?token_hash=…`) | Sesión iniciada y `/organizador?bienvenido=1` o `/mi-cuenta?bienvenido=1` |
| Mismo enlace otra vez, o recargar esa página, **con sesión** | Su espacio con el mensaje «Tu cuenta ya está verificada» (`?yaVerificada=1`). Nunca una página en blanco |
| Mismo enlace vencido o usado, **sin sesión** | `/entrar?error=confirm` con «el enlace no es válido o ya venció» |
| Entrar (`/entrar`) con cuenta sin confirmar | `/entrar?error=unconfirmed` y botón para reenviar |
| Entrar bien | La ruta de `?next=` si es interna, si no su espacio (`/organizador` o `/mi-cuenta`) |
| Salir | `/{lang}` |
| Recuperar contraseña | Pendiente: no existe todavía (KIN-601) |

## Organizador
| Paso | Destino esperado |
|---|---|
| Crear evento (`/organizador/eventos/nuevo`) | `/organizador/eventos/<slug>?nuevo=publicado` o `=borrador` (pantalla del evento con su enlace) |
| Crear con error | Vuelve al formulario con el mensaje del error (`?error=…`) |
| Publicar / pasar a borrador | La pantalla del evento |
| Editar | `/organizador/eventos/<slug>?editado=1` |
| Marcar un pago desde la pestaña Pagos (`/organizador/pagos`, KIN-754) | La misma pantalla, con los mismos filtros (`?evento=…&estado=…&q=…`); si falla, `&pagoError=1`. El cambio es el de la inscripción: se ve igual en el evento y en la app |
| Agregar, editar, unir o borrar una arena (`/organizador/arenas`, KIN-751) | La misma pantalla del catálogo (`?agregada=1`, `?borrada=1`) o la de la arena (`?guardada=1`, `?unida=1`); con error, `?error=…` (`duplicate`, `invalid`, `inUse`, `mergeFailed`) |
| Sacar a un inscrito | La pantalla del evento con el resultado (`?sacado=…`) |
| Borrar evento | `/organizador?borrado=1`; con error, la pantalla del evento con el motivo (`?borrarError=…`) |
| Borrar serie | `/organizador/series?borrada=1`; con eventos, la serie con «borra primero los eventos» |
| Organizador sin licencia que intenta crear | `/organizador` con su aviso de revisión |

## Participante
| Paso | Destino esperado |
|---|---|
| Inscribirse (`/eventos/<slug>/inscribirse`) | `/mi-cuenta?inscrito=1` |
| Inscribirse a un evento cerrado, lleno, pasado o del que lo sacaron | La misma pantalla con el mensaje (`?error=registration_closed`, `full`, `removed`…) |
| Cancelar inscripción | `/mi-cuenta?cancelado=1` |
| Pagar en línea | Stripe y de regreso a `/mi-cuenta?pago=ok` |
| Avisos (campana o banner) | `/notificaciones` |

## Rutas que no existen
Cualquier ruta sin idioma se redirige a `/es` o `/en` según el navegador. Una ruta con idioma que no existe, o un evento, serie o perfil
borrado, muestra la página 404 amigable (`src/app/[lang]/not-found.tsx`) con botones de regreso al inicio.

## Estado de la revisión
- Corregido: un enlace de confirmación ya usado, o recargar su página, dejaba en `/entrar?error=confirm` aunque la cuenta ya estuviera verificada.
  Ahora, con sesión, lleva a su espacio con el mensaje de «ya verificada».
- Corregido: no había página 404 propia; ahora existe.
- Los destinos de la tabla se revisaron leyendo el código de cada acción. **Falta recorrerlos a mano con cuentas reales** (con y sin sesión,
  escritorio y móvil), que es el paso 5 de la prueba de punta a punta.
