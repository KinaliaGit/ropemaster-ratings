# Criterios responsivos de la web (KIN-780)

Contrato visual para todas las pantallas. Se revisa a **375 px** (teléfono), **768 px** (tablet) y **1280 px** (escritorio).

## Puntos de corte
Los de Tailwind. Se diseña primero para celular y se agregan excepciones hacia arriba.

| Prefijo | Desde | Uso |
|---|---|---|
| (sin prefijo) | 0 | Celular: una columna |
| `sm:` | 640 px | Aparecen tablas; los botones pueden compactarse |
| `md:` | 768 px | Encabezado centrado, rejillas de 3 |
| `lg:` | 1024 px | Dos columnas (cartel y detalle) |

## Reglas
1. **Sin desplazamiento horizontal** de la página en ningún ancho.
2. **Rejillas:** declara siempre la columna de celular (`grid-cols-1`). Sin ella, un texto largo ensancha la columna aunque tenga `truncate`.
   Los hijos flexibles que recortan texto llevan `min-w-0`.
3. **Área táctil:** 44 px (`min-h-11`) en las acciones principales y de diálogo; 40 px en pestañas; mínimo 32 px en enlaces y acciones
   secundarias sueltas. Los enlaces dentro de un párrafo quedan exentos.
4. **Textos largos** (nombres de evento o lazador): `break-words` donde deban leerse completos; `truncate` solo en listas.

## Patrones
**Campos de texto.** En pantallas táctiles miden 16 px (regla en `globals.css`): con menos, iPhone hace zoom al tocarlos. No se baja ese
tamaño ni se bloquea el zoom en el `viewport`.

**Contenedor de página.** Toda pantalla usa `<div className="page">` (mismo ancho que la barra y el pie: 1024 px, 20 px a los lados). Solo
entrar, registrarse, recuperar la contraseña y «no encontrado» usan `page-narrow`. No se ponen anchos ni márgenes de página a mano.

**Tablas.** En celular, tarjetas; desde `sm`, tabla dentro de un contenedor con desplazamiento. Ejemplo: `OrgParticipantsTable`.
```tsx
<div className="space-y-3 sm:hidden">{/* una tarjeta por fila */}</div>
<div className="card hidden overflow-x-auto sm:block"><table className="w-full text-left text-sm">…</table></div>
```

**Diálogos.** `<dialog>` con `w-[min(92vw,28rem)]`; los botones en `flex flex-wrap justify-end gap-2`, cada uno con `min-h-11 sm:min-h-0`.
Ejemplo: `DeleteConfirmDialog`.

**Formularios.** Una columna en celular; columnas desde `sm` (`sm:grid-cols-…`). Campos a todo el ancho (`w-full`) con la etiqueta arriba.

**Barras fijas inferiores.** Solo en celular (`lg:hidden`); el pie deja espacio (`pb-28`) y el selector de idioma no flota.

## Revisión inicial (2026-11-25)
Medidas a 375, 768 y 1280 px en: inicio, participantes, perfil público, dos eventos, entrar, registro, recuperar y 404.
No se probó en un teléfono físico.

Segunda pasada, **con sesión de organizador** (con perfil de lazador y permisos de administrador): panel, tres eventos, crear y editar evento,
series (lista, detalle y nueva), participantes, pagos, arenas (lista y detalle), administración, App local, «Mi cuenta» y avisos, a 375, 768 y
1280 px. No se abrieron los diálogos ni se revisó una cuenta de solo participante. A 768 y 1280 px no se detectaron desbordes.

| Pantalla | Defecto | Responsable | Estado |
|---|---|---|---|
| Evento con resultados | A 375 px la página medía 421 px por un nombre largo | Anita | Corregido |
| Pie de página | Enlaces de 20 px de alto | Anita | Corregido |
| Resultados e historial | «Ver rondas» de 16 px | Anita | Corregido |
| Diálogos y pestañas | Botones por debajo del área táctil | Anita | Corregido |
| Resultados, inscritos | Nombres enlazados de ~20 px dentro de la fila | Anita (KIN-768) | Pendiente |
| Pagos del organizador (`organizador/pagos`) | Tablas sin versión de tarjetas en celular (visto en el código) | Emiliano | Pendiente |
| Historial del lazador (`ProfileHistory`) | Tabla sin versión de tarjetas en celular (visto en el código) | Anita | Pendiente |
| Pestañas del organizador | La pestaña actual quedaba cortada a 375 px | Anita | Corregido |
| Pestañas del organizador | Con la pestaña de administración, entre 640 y ~760 px la página se desbordaba | Anita | Corregido |
| «Mi cuenta» | A 375 px el nombre se partía en tres líneas y «Mi rol:» en dos | Anita | Corregido |
| «Mi cuenta» y panel del organizador | Enlaces y botones de 17 a 30 px | Anita (KIN-763, KIN-770) | Corregido en parte |
| Crear y editar evento, nueva serie | A 375 px la página mide de 420 a 436 px (rejilla de categorías `grid-cols-[1fr_9.5rem]`) | Edgar | Pendiente |
| Evento del organizador | «Volver», nombres, «Efectivo», «Transferencia», «Sacar del evento» de 17 a 26 px | Emiliano | Pendiente |
| Pagos | A 375 px las dos tablas se deslizan de lado (429 y 505 px en 333); botones de 24 px | Emiliano | Pendiente |
| Participantes del organizador | Nombres enlazados de 24 px | Emiliano | Pendiente |
| Arena (detalle) | «Mis arenas» de 17 px | Edgar | Pendiente |
| Serie (detalle) | Acciones de 20 a 28 px | Sin dueño asignado en el plan | Pendiente |
| Administración | «Verificar» y «Revocar» de 28 a 30 px | Sin dueño asignado en el plan | Pendiente |

## Auditoría final (KIN-781, 2026-11-26)
28 pantallas a 375, 768 y 1280 px (84 mediciones) con sesión de organizador con perfil de lazador, sobre la versión posterior a los
rediseños. **Sustituye a las tablas anteriores** donde difieran. A 768 y 1280 px no se detectaron desbordes ni elementos por revisar.

| Pantalla (a 375 px) | Defecto | Responsable | Estado |
|---|---|---|---|
| Nuevo evento, editar evento | La página medía 420 px (rejilla de categorías `grid-cols-[1fr_9.5rem]`) | Edgar (formulario) | Corregido: la rejilla ya encoge; la página mide 375 px. Avisar a Edgar |
| Nueva serie | La página medía 436 px, misma rejilla | Edgar (formulario) | Corregido igual que el anterior. Avisar a Edgar |
| Formularios de evento y serie | «+ Agregar categoría» y «volver» de 17 a 20 px | Edgar | Pendiente |
| Portada | Campo de búsqueda de 20 px de alto | Anita | Corregido |
| Nombres en tarjetas y resultados | Enlaces de 20 px | Anita | Corregido |
| Panel, entrar, recuperar, inscribirse | «Actividad reciente» y enlaces sueltos de 17 a 28 px | Anita | Corregido |
| Perfil y registro | «Reportar» y «Términos» dentro de un párrafo | — | Exentos |
| Evento del organizador | «Volver», nombres y «Deshacer» de 17 a 26 px | Emiliano | Pendiente |
| Participantes del organizador (sin enlace en la barra) | Nombres de 24 px | Emiliano | Pendiente |
| Detalle de serie | Acciones de 17 a 28 px | Sin dueño asignado | Pendiente |
| Detalle de arena | «Mis arenas» de 17 px | Edgar | Pendiente |

**No cubierto:** cuenta de solo participante, diálogos abiertos y prueba en un teléfono físico (la hace una persona).

### Segunda pasada (26 nov 2026, sobre `main` en `c4ab4f0`)
Con los cambios ya integrados: 90 mediciones (8 vistas públicas sin sesión y 22 con sesión de organizador, a 375, 768 y 1280 px). **Sin
desbordes ni textos cortados** en ningún ancho. **Sustituye a la tabla anterior.** Prueba física del mismo día: iPhone y computadora (Ana).

| Pantalla | Ancho | Defecto (alto en px) | Responsable | Estado |
|---|---|---|---|---|
| Vistas públicas, paneles, Pagos, entrar e inscripción | Todos | Ninguno | Anita | Correcto |
| Detalle de serie | Todos | «Gestionar» 28 y «+ Agregar otro evento» 20 | Sin dueño | Corregido |
| Nuevo y editar evento; nueva y editar serie | Todos | «+ Agregar categoría» 20 | Edgar | Corregido por Ana. Avisar a Edgar |
| Evento del organizador | Todos | Nombre 20, «Efectivo» y «Transferencia» 24, «Sacar del evento» y «Volver a bloquear» 26 | Emiliano | Corregido por Ana. Avisar a Emiliano |
| Participantes del organizador (sin enlace en la barra) | Todos | Nombres 24 | Emiliano | Corregido por Ana. Avisar a Emiliano |
| Administración (retirada de la navegación) | Todos | «Verificar» y «Revocar» 28 a 30 | — | Corregido |

Después de corregir, las siete pantallas afectadas se volvieron a medir en los tres anchos (21 mediciones): sin desbordes ni controles de
menos de 32 px.

**No cubierto:** cuenta de solo participante (se probó a mano en KIN-770), diálogos abiertos y la vista en vivo (KIN-558, aún sin integrar).
