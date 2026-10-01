# @mundoit-lib — monorepo

Librerías frontend de Mundo IT. Cada carpeta de `packages/` es un paquete npm independiente, con su propio nombre y versión; las apps que las consumen no notan diferencia con los repos originales.

| Paquete | Qué es | npm |
|---|---|---|
| [`packages/plugin-vue-event`](packages/plugin-vue-event) | Bus de eventos global (`$events`, opción `events:`) | `@mundoit-lib/plugin-vue-event` |
| [`packages/plugin-vue-auth`](packages/plugin-vue-auth) | Autenticación OAuth2 password grant contra Histrix (`useAuth`, `$auth`) | `@mundoit-lib/plugin-vue-auth` |
| [`packages/plugin-vue-axios`](packages/plugin-vue-axios) | Instancia de axios compartida (`$axios`, `getAxiosInstance`, `setDatabase`) | `@mundoit-lib/plugin-vue-axios` |

Próximo en entrar: `@mundoit-lib/histrix-component-vue` (hoy en [`mundoit-lib/histrix-component-vue`](https://github.com/mundoit-lib/histrix-component-vue)), cuando termine el plan HD-7515.

## Desarrollo

```bash
pnpm install          # una sola vez, instala todo el workspace
pnpm build            # tsup en cada paquete → packages/*/dist
pnpm test             # vitest sobre packages/*/src/**/*.test.ts
pnpm lint             # biome (formato + lint); pnpm lint:fix para corregir
pnpm --filter @mundoit-lib/plugin-vue-auth build   # un solo paquete
```

Node ≥ 22, pnpm 11 (el `packageManager` del `package.json` raíz fija la versión). Finales de línea LF.

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

1. `packages/<nombre>/` con `package.json` (`name` bajo `@mundoit-lib/`, `files: ["dist"]`, `publishConfig.access: public`, `repository.directory`), `src/`, `tsup.config.ts` y `tsconfig.json`.
2. Scripts mínimos: `build` (tsup) y `test` (`vitest run --passWithNoTests`).
3. Las devDependencies compartidas (`tsup`, `typescript`, `vitest`, `@biomejs/biome`) viven en la raíz: no repetirlas.

## Historia

Los tres plugins se importaron con `git subtree` desde sus repos originales el 2026-10-01, conservando el historial. Los repos viejos quedan para archivar cuando la primera publicación desde acá salga bien.
