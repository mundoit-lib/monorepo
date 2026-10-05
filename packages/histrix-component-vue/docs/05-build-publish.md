# 05 — Publicación y desarrollo

## Cómo se consume

Esta librería **se distribuye como código fuente**. El tarball de npm contiene `src/` con los `.vue` sin compilar y los tipos de `types/` (`files` en `package.json`); las apps clientes los importan y **su propio bundler los compila** (Vue 3 + Quasar 2).

Entradas del paquete:

| Import | Resuelve a | Para qué |
|---|---|---|
| `@mundoit-lib/histrix-component-vue` | `src/index.esm.js` | Named exports + default plugin |
| `…/plugin` | `src/index.js` | Plugin con `install(app)` que registra todo globalmente |
| `…/components/X` | `src/components/X.vue` | Import directo de un componente |
| `…/components/widgets/X` | `src/components/widgets/X.vue` | Import directo de un widget |
| `…/services/{histrixApi,config,histrix-bearer}` | `src/services/*.js` | API client, config runtime, driver auth |

> Hasta v0.0.199 los campos `main`/`module` apuntaban a un `dist/` que nunca se publicó (el import raíz fallaba). Desde v0.1.0 apuntan a `src/index.esm.js` y el import raíz funciona.

**No hay build step.** El pipeline Rollup legacy que vivía en `ui/build/` del repo viejo (ESM/CJS/UMD + CSS) se eliminó en la Fase 1 del plan de evolución; si alguna vez hace falta un bundle standalone, está en el historial de git (hasta `v0.0.199`).

## Versionado y publicación

Igual que el resto del monorepo (`mundoit-lib/monorepo`, ver su README):

1. El PR que cambia la librería bumpea `version` en `packages/histrix-component-vue/package.json`.
2. Al mergear a `main`, `.github/workflows/publish.yml` corre los checks y `scripts/release.mjs`, que publica sólo las versiones que no están en npm (`pnpm pack` + `npm publish`, auth por OIDC trusted publishing) y crea el tag `histrix-component-vue@<version>`.
3. `pnpm release:dry` en la raíz muestra qué se publicaría.

No se publica a mano ni se crean tags a mano. Los tags `v0.x.y` son del repo viejo (`histrix-component-vue`, archivado).

Reglas de versionado acordadas:

- **`0.0.x`** — serie legacy Vue 2/Vue 3 vía `vue-demi`. Congelada; solo hotfixes críticos para apps Vue 2.
- **`0.1.x`** — Vue 3 + Quasar 2 nativo (actual).

## Desarrollo local: el playground

`apps/playground` (en el monorepo) es una app **Vite + Vue 3 + Quasar 2** que consume esta librería y los tres plugins por `workspace:*` (symlink vivo: editar `src/` se refleja con HMR) respetando los `exports` reales del paquete, igual que una app cliente.

```bash
pnpm install                                            # en la raíz del monorepo
cp apps/playground/.env.example apps/playground/.env    # host del backend, db, client_id/secret
pnpm turbo run build --filter histrix-dev-playground    # buildea los plugins
pnpm --filter histrix-dev-playground dev
```

Funciones: login contra un backend Histrix real, y una ruta catch-all `/app/<path-del-xml>` que monta `<HistrixApp>` con cualquier pantalla. Detalle en `apps/playground/README.md`.

`pnpm build` en la raíz también buildea el playground: compila **todos** los `.vue` de la librería con Vue 3 + Quasar 2 reales y corre en CI como smoke test de compilación.

## Tests, tipos y lint

```bash
pnpm --filter @mundoit-lib/histrix-component-vue test       # Vitest (config de la raíz, TZ=UTC)
pnpm --filter @mundoit-lib/histrix-component-vue typecheck  # tsc sobre types/ contra las fixtures
pnpm lint                                                   # oxlint + oxfmt --check + sherif + knip
```

El formato es el del monorepo (`.oxfmtrc.json`): 2 espacios, 120 columnas, **LF**, comillas simples, sin trailing commas. Como el paquete no tiene build, turbo no le corre `build`, `check:exports` ni `size`.
