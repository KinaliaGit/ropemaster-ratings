# Revisión automática y protección de `main`

## Qué corre en cada PR y en `main`
Workflow: `.github/workflows/ci.yml`. Dos checks, los dos deben pasar:

| Check | Qué hace |
|---|---|
| `Lint, tipos y build` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build` (con variables falsas de Supabase) |
| `Permisos de la base` | `npm run test:db`: aplica todas las migraciones en PGlite y comprueba quién ve/escribe qué |

`npm run typecheck` hace `next typegen && tsc --noEmit`. El `typegen` es necesario: Next genera tipos globales como `PageProps` y sin él `tsc` falla en un checkout limpio.

## Correr todo en local
```bash
npm ci
npm run lint
npm run typecheck
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=falsa npm run build
npm run test:db
```

## Cuando cambias permisos o migraciones
- Migración nueva: reserva el número siguiente en `supabase/migrations/` (revisa PR abiertos para no chocar) y no edites migraciones ya aplicadas.
- Cambio de RLS/grants: agrega o ajusta comprobaciones en `supabase/tests/permisos.mjs`. El script sale con código 1 si alguna falla.

## Ajustes de GitHub (los hace alguien con permiso de admin del repo)
Esto no se puede versionar en el repo; hay que activarlo en *Settings* o con `gh`. Haz esto **después** de que `ci.yml` haya corrido al menos una vez, para que los checks aparezcan en la lista.

1. **Protección de `main`** (*Settings → Branches → Add rule*, o *Rulesets*):
   - Require a pull request before merging, con 1 aprobación.
   - Require status checks to pass: `Lint, tipos y build` y `Permisos de la base`; activar *Require branches to be up to date*.
   - Block force pushes y restringir borrado de la rama.
   - Activar *Do not allow bypassing* (incluye admins) si quieren que nadie empuje directo.
2. **Dependabot**: *Settings → Code security* → activar *Dependabot alerts* y *Dependabot security updates*. Las actualizaciones semanales ya están configuradas en `.github/dependabot.yml`.
3. **Secret scanning** y *push protection*: en el mismo panel. En repos privados requieren GitHub Secret Protection (Advanced Security) en la organización; si el plan no lo incluye, el botón no aparece.

Nota: en repos privados, la protección de ramas también depende del plan de la organización (Team o superior).

## Pendiente (opcional)
Pruebas de extremo a extremo con Playwright (registro de organizador, crear y publicar evento, abrir el enlace, cambio es/en). Necesitan un Supabase de prueba, por eso quedan para un segundo paso.
