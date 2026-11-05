# Ropemaster Ratings

Web con el registro global de lazadores: perfil, rating e historial de eventos.
Next.js + Supabase. Diseño en [docs/DISENO.md](docs/DISENO.md).

## Desarrollo
```bash
cp .env.example .env.local   # llena las llaves de Supabase
npm install
npm run dev
```
El esquema inicial está en `supabase/migrations/0001_initial.sql`.

## Revisiones automáticas
Cada PR y cada push a `main` corren en GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)). Lo mismo, en local:
```bash
npm ci
npm run lint
npm run typecheck   # next typegen + tsc --noEmit
npm run build       # necesita NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (sirven valores falsos)
npm run test:db     # aplica supabase/migrations/ en PGlite y comprueba permisos; no necesita Supabase real
```
Más detalle (protección de `main`, Dependabot, secret scanning): [docs/CI.md](docs/CI.md).
