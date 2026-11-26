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
**No se revisaron** las pantallas con sesión ni se probó en un teléfono físico.

| Pantalla | Defecto | Responsable | Estado |
|---|---|---|---|
| Evento con resultados | A 375 px la página medía 421 px por un nombre largo | Anita | Corregido |
| Pie de página | Enlaces de 20 px de alto | Anita | Corregido |
| Resultados e historial | «Ver rondas» de 16 px | Anita | Corregido |
| Diálogos y pestañas | Botones por debajo del área táctil | Anita | Corregido |
| Resultados, inscritos | Nombres enlazados de ~20 px dentro de la fila | Anita (KIN-768) | Pendiente |
| Pagos del organizador (`organizador/pagos`) | Tablas sin versión de tarjetas en celular (visto en el código) | Emiliano | Pendiente |
| Historial del lazador (`ProfileHistory`) | Tabla sin versión de tarjetas en celular (visto en el código) | Anita | Pendiente |
| Panel del organizador y «Mi cuenta» | Falta revisar con sesión | Anita (KIN-763, KIN-770) | Pendiente |
| Formulario de evento | Falta revisar | Edgar | Pendiente |
