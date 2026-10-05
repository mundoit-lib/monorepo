# @mundoit-lib — monorepo

Librerías frontend de Mundo IT. Cada carpeta de `packages/` es un paquete npm independiente, con su propio nombre y versión; las apps que las consumen no notan diferencia con los repos originales.

| Paquete | Qué es | npm |
|---|---|---|
| [`packages/plugin-vue-event`](packages/plugin-vue-event) | Bus de eventos global (`$events`, opción `events:`) | `@mundoit-lib/plugin-vue-event` |
| [`packages/plugin-vue-auth`](packages/plugin-vue-auth) | Autenticación OAuth2 password grant contra Histrix (`useAuth`, `$auth`) | `@mundoit-lib/plugin-vue-auth` |
| [`packages/plugin-vue-axios`](packages/plugin-vue-axios) | Instancia de axios compartida (`$axios`, `getAxiosInstance`, `setDatabase`) | `@mundoit-lib/plugin-vue-axios` |

`tooling/` guarda configuración compartida que no se publica: [`tooling/typescript`](tooling/typescript) (`@mundoit-lib/tsconfig`, privado) tiene el `base.json` y el `library.json` que extiende cada paquete, y [`tooling/tsdown`](tooling/tsdown) (`@mundoit-lib/tsdown-config`, privado) exporta `libraryConfig({ entry })` con la config de build común (ESM `.js` + CJS `.cjs`, `platform: 'neutral'`, `es2022`, sin minificar: minifica el bundler de la app).

Próximo en entrar: `@mundoit-lib/histrix-component-vue` (hoy en [`mundoit-lib/histrix-component-vue`](https://github.com/mundoit-lib/histrix-component-vue)), cuando termine el plan HD-7515.

## Desarrollo

```bash
pnpm install          # una sola vez, instala todo el workspace
pnpm build            # turbo → tsdown en cada paquete → packages/*/dist (con caché)
pnpm typecheck        # turbo → tsc --noEmit en cada paquete
pnpm test             # turbo → vitest en cada paquete (packages/*/src/**/*.test.ts)
pnpm lint             # oxlint + oxfmt --check + sherif + knip; pnpm lint:fix para corregir
pnpm check:exports    # publint + are-the-types-wrong sobre el dist de cada paquete
pnpm turbo run build --filter @mundoit-lib/plugin-vue-auth   # un solo paquete
```

Node `^22.18.0 || ^24.11.0 || >=26.0.0` (lo que soportan tsdown y vitest; `.node-version` fija 24 para desarrollo y publish, CI prueba 22 y 24), pnpm 11 (el `packageManager` del `package.json` raíz fija la versión). Finales de línea LF.

Turborepo orquesta las tareas por paquete (`turbo.json`) y cachea en `.turbo/`: si un paquete no cambió, su `build`/`test` sale de caché. `--force` lo ignora.

## Publicación

No hay tags manuales ni `npm publish` a mano.

1. En el PR, bumpear `version` en el `package.json` del paquete que cambió (semver: fix → patch, feature → minor, breaking → major).
2. Al mergear a `main`, el workflow [`publish.yml`](.github/workflows/publish.yml) corre [`scripts/release.mjs`](scripts/release.mjs): compara la versión de cada paquete con npm y publica **sólo** las que no existen todavía, creando el tag `<paquete>@<version>` (por ejemplo `plugin-vue-auth@2.0.0`).
3. Si el PR no cambió ninguna versión, no se publica nada.

`pnpm release:dry` muestra localmente qué se publicaría.

### Autenticación en npm (una sola vez por paquete)

Se usa **trusted publishing (OIDC)**, sin tokens en secrets, igual que los repos originales. Para cada paquete hay que registrar este repo como publisher en npmjs.com → *Package settings → Trusted publishers*:

- Publisher: GitHub Actions
- Organization/user: `mundoit-lib`
- Repository: `monorepo`
- Workflow filename: `publish.yml`

Hasta que eso no esté hecho, el workflow falla con `ENEEDAUTH`/`E404` en el paso de publicar. Alternativa: crear el secret `NPM_TOKEN` (token *Automation*) y agregar `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` al paso de publish.

## Agregar un paquete

1. `packages/<nombre>/` con `package.json` (`name` bajo `@mundoit-lib/`, `files: ["dist"]`, `publishConfig.access: public`, `repository.directory`), `src/`, `tsdown.config.ts` con solo `export default libraryConfig({ entry: ['src/index.ts'] })` (importado de `@mundoit-lib/tsdown-config`) y `tsconfig.json` con solo `{ "extends": "@mundoit-lib/tsconfig/library.json", "include": ["src"] }` (más `"@mundoit-lib/tsconfig": "workspace:*"` y `"@mundoit-lib/tsdown-config": "workspace:*"` en `devDependencies`). Las opciones de compilación y de build van en `tooling/typescript` y `tooling/tsdown`, no en el paquete.
2. Scripts mínimos: `build` (tsdown), `test` (`vitest run --passWithNoTests`), `typecheck` (`tsc --noEmit`) y `check:exports` (`publint && attw --pack . --profile node16`). Turbo los toma solos.
3. Las devDependencies compartidas (`tsdown`, `typescript`, `vitest`, `turbo`, `oxlint`, `oxfmt`, `sherif`, `knip`) viven en la raíz: no repetirlas.

## Historia

Los tres plugins se importaron con `git subtree` desde sus repos originales el 2026-10-01, conservando el historial. Los repos viejos quedan para archivar cuando la primera publicación desde acá salga bien.
